import { task, logger } from "@trigger.dev/sdk/v3"
import {
  GoogleGenerativeAI,
  type GenerateContentRequest,
  type Part,
} from "@google/generative-ai"
import type { NodeExecutionPayload, NodeExecutionResult } from "./engine/types"
import { exec } from "child_process"
import { promisify } from "util"
import fs from "fs"
import path from "path"
import os from "os"
import crypto from "crypto"
import { Transloadit } from "transloadit"
import {
  normalizeLLMModel,
  normalizeLLMOutputType,
} from "@/lib/llmModels"

const execAsync = promisify(exec)

function getFfmpegPath() {
  if (process.platform === "win32") {
    const localWinPath = path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg.exe")
    if (fs.existsSync(localWinPath)) return `"${localWinPath}"`
  }
  return "ffmpeg"
}

function getFfprobePath() {
  if (process.platform === "win32") {
    const localWinPath = path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffprobe.exe")
    if (fs.existsSync(localWinPath)) return `"${localWinPath}"`
  }
  return "ffprobe"
}

function parseFiniteNumber(value: unknown): number | null {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN

  return Number.isFinite(number) ? number : null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function parseDurationFromFfmpeg(stderr: string): number | null {
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr)
  if (!match) return null

  const hours = Number.parseInt(match[1], 10)
  const minutes = Number.parseInt(match[2], 10)
  const seconds = Number.parseFloat(match[3])
  const duration = hours * 3600 + minutes * 60 + seconds
  return Number.isFinite(duration) && duration > 0 ? duration : null
}

async function getVideoDurationSeconds(inputPath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `${getFfprobePath()} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`
    )
    const duration = Number.parseFloat(stdout.trim())
    if (Number.isFinite(duration) && duration > 0) return duration
  } catch (err) {
    logger.warn("ffprobe duration lookup failed", {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  try {
    await execAsync(`${getFfmpegPath()} -i "${inputPath}"`)
  } catch (err) {
    const stderr = typeof (err as { stderr?: unknown }).stderr === "string"
      ? (err as { stderr: string }).stderr
      : ""
    const duration = parseDurationFromFfmpeg(stderr)
    if (duration) return duration
  }

  throw new Error("Unable to determine video duration for percent-based frame extraction")
}

async function resolveExtractFrameSeconds(
  data: Record<string, unknown>,
  inputPath: string
): Promise<number> {
  const timestamp = data.timestamp
  const mode = data.timestampMode === "percent" ? "percent" : "seconds"
  const timestampString = typeof timestamp === "string" ? timestamp.trim() : ""
  const timestampIsPercent = timestampString.endsWith("%")

  if (mode === "percent" || timestampIsPercent) {
    const percent =
      parseFiniteNumber(data.framePercent) ??
      parseFiniteNumber(timestampIsPercent ? timestampString.slice(0, -1) : timestamp)

    if (percent === null) {
      throw new Error("Frame percent must be a number between 0 and 100")
    }

    const duration = await getVideoDurationSeconds(inputPath)
    const safePercent = clamp(percent, 0, 100)
    const seconds = (duration * safePercent) / 100
    return clamp(seconds, 0, Math.max(0, duration - 0.05))
  }

  return Math.max(0, parseFiniteNumber(timestamp) ?? 0)
}

/**
 * Safely extract a string from an input value.
 */
function extractString(val: unknown): string {
  if (typeof val === "string") return val
  if (val && typeof val === "object") {
    if ("url" in val) {
      const inner = (val as Record<string, unknown>).url
      return typeof inner === "string" ? inner : inner ? JSON.stringify(inner) : ""
    }
    if ("previewUrl" in val) {
      const inner = (val as Record<string, unknown>).previewUrl
      return typeof inner === "string" ? inner : inner ? JSON.stringify(inner) : ""
    }
    if ("fileUrl" in val) {
      const inner = (val as Record<string, unknown>).fileUrl
      return typeof inner === "string" ? inner : inner ? JSON.stringify(inner) : ""
    }
    if ("resultUrl" in val) {
      const inner = (val as Record<string, unknown>).resultUrl
      return typeof inner === "string" ? inner : inner ? JSON.stringify(inner) : ""
    }
    if ("text" in val) {
      const inner = (val as Record<string, unknown>).text
      return typeof inner === "string" ? inner : inner ? JSON.stringify(inner) : ""
    }
    if ("output" in val) {
      const inner = (val as Record<string, unknown>).output
      return typeof inner === "string" ? inner : inner ? JSON.stringify(inner) : ""
    }
    if ("result" in val) {
      const inner = (val as Record<string, unknown>).result
      return typeof inner === "string" ? inner : inner ? JSON.stringify(inner) : ""
    }
  }
  return val ? String(val) : ""
}

function extractImageUrls(val: unknown): string[] {
  if (!val) return []
  if (Array.isArray(val)) return val.flatMap(extractImageUrls)
  if (typeof val === "string") return val ? [val] : []
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>
    if (typeof obj.url === "string") return [obj.url]
    if (typeof obj.previewUrl === "string") return [obj.previewUrl]
    if (typeof obj.fileUrl === "string") return [obj.fileUrl]
    if (typeof obj.resultUrl === "string") return [obj.resultUrl]
    if ("output" in obj) return extractImageUrls(obj.output)
  }
  return []
}

async function downloadFile(url: string, dest: string, attempts = 3) {
  if (url.startsWith("blob:") || url.startsWith("data:")) {
    throw new Error(
      `Cannot download local URL "${url.slice(0, 64)}…" from a Trigger task. ` +
      `The upload node must finish uploading before the workflow runs.`,
    )
  }
  if (/^https?:\/\/(localhost|127\.|0\.0\.0\.0)/i.test(url)) {
    throw new Error(
      `Refusing to fetch localhost URL "${url}" from a Trigger task — ` +
      `it is not reachable from the worker. Wait for the upload to publish a public URL.`,
    )
  }
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: { "User-Agent": "flowforge-trigger/1.0" },
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`)
      }
      const buffer = await res.arrayBuffer()
      fs.writeFileSync(dest, Buffer.from(buffer))
      return
    } catch (err) {
      lastErr = err
      const cause =
        err instanceof Error && "cause" in err ? (err as { cause: unknown }).cause : undefined
      logger.warn(
        `downloadFile attempt ${i + 1}/${attempts} failed for ${url}: ${err instanceof Error ? err.message : String(err)
        }${cause ? ` (cause: ${String(cause)})` : ""}`,
      )
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 500 * (i + 1)))
      }
    }
  }
  throw new Error(
    `Failed to download ${url} after ${attempts} attempts: ${lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  )
}

async function uploadToTransloadit(filePath: string): Promise<string> {
  const authKey = process.env.TRANSLOADIT_AUTH_KEY || ""
  const authSecret = process.env.TRANSLOADIT_SECRET || ""
  if (!authKey || !authSecret) {
    throw new Error("TRANSLOADIT_AUTH_KEY and TRANSLOADIT_SECRET must be set")
  }

  const tl = new Transloadit({
    authKey,
    authSecret,
  })

  // The Node SDK expects steps under `params`, matching the REST API payload.
  // The "exported" step persists the file to Cloudflare R2 for a permanent URL.
  const r2Url = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "")
  const options = {
    files: { file: filePath },
    params: {
      steps: {
        ":original": { robot: "/upload/handle" },
        exported: {
          robot: "/cloudflare/store",
          use: ":original",
          credentials: "nextflow_r2",
          path: "uploads/${unique_prefix}/${file.url_name}",
          url_prefix: r2Url ? `${r2Url}/` : "",
          result: true,
        },
      },
    },
    waitForCompletion: true,
  }

  const status = await tl.createAssembly(options)

  // Prefer the exported (permanent R2) URL
  const exportedResults = status.results?.exported
  if (Array.isArray(exportedResults) && exportedResults.length > 0) {
    return exportedResults[0].ssl_url || ""
  }
  // Fallback to temp upload URL
  if (status.uploads && status.uploads.length > 0) {
    return status.uploads[0].ssl_url || ""
  }
  throw new Error("Transloadit upload failed — no results")
}

/**
 * Executes a single node in the workflow.
 */
export const executeNodeTask = task({
  id: "node.execute",
  maxDuration: 300,

  run: async (payload: NodeExecutionPayload): Promise<NodeExecutionResult> => {
    const { nodeId, nodeType, data, inputs } = payload
    logger.info(`Executing node: ${nodeId} (type: ${nodeType})`, { data, inputs })

    if (data.__cachedOutput !== undefined) {
      logger.info(`Node ${nodeId}: using cached output from prior run`)
      return { output: data.__cachedOutput }
    }

    switch (nodeType) {
      /* ── Pass-through nodes ─────────────────────────────── */

      case "text": {
        const text = (data.text as string) ?? ""
        logger.info(`Text node output: "${text.slice(0, 100)}"`)
        return { output: text }
      }

      case "upload_image": {
        const url = (data.fileUrl as string) ?? (data.previewUrl as string) ?? (data.url as string) ?? ""
        logger.info(`Upload image output: ${url}`)
        return { output: url }
      }

      case "upload_video": {
        const url = (data.fileUrl as string) ?? (data.previewUrl as string) ?? (data.url as string) ?? ""
        logger.info(`Upload video output: ${url}`)
        return { output: url }
      }

      /* ── LLM Node — Google Gemini ───────────────────────── */

      case "llm": {
        const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
        if (!apiKey) {
          throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set")
        }

        const outputType = normalizeLLMOutputType(data.outputType)
        const model = normalizeLLMModel(data.model, outputType)
        const systemPrompt = extractString(inputs["system-prompt-in"] ?? data.systemPrompt ?? "")
        const userMessage = extractString(inputs["user-message-in"] ?? data.userMessage ?? "")

        if (!userMessage) {
          throw new Error("User message is required for LLM node")
        }

        const imageUrls = extractImageUrls(inputs["images-in"])

        logger.info(
          `LLM call: model=${model}, outputType=${outputType}, system="${systemPrompt.slice(0, 50)}", user="${userMessage.slice(0, 50)}", images=${imageUrls.length}`,
        )

        const genAI = new GoogleGenerativeAI(apiKey)
        const genModel = genAI.getGenerativeModel({
          model,
          systemInstruction: systemPrompt || undefined,
        })

        const parts: Part[] = [
          { text: userMessage },
        ]

        for (const url of imageUrls) {
          try {
            const res = await fetch(url)
            if (res.ok) {
              const buffer = await res.arrayBuffer()
              const base64 = Buffer.from(buffer).toString("base64")
              const contentType = res.headers.get("content-type") ?? "image/jpeg"
              parts.push({
                inlineData: {
                  mimeType: contentType,
                  data: base64,
                },
              })
            }
          } catch (err) {
            logger.warn(`Failed to fetch image: ${url}`, { error: err })
          }
        }

        if (outputType === "image") {
          const stabilityKey = process.env.STABILITY_API_KEY
          if (!stabilityKey) {
            throw new Error("STABILITY_API_KEY is not set")
          }

          const fullPrompt = [systemPrompt, userMessage].filter(Boolean).join("\n\n")

          const formData = new FormData()
          formData.append("prompt", fullPrompt)
          formData.append("output_format", "png")

          const response = await fetch(
            "https://api.stability.ai/v2beta/stable-image/generate/core",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${stabilityKey}`,
                Accept: "application/json",
              },
              body: formData,
            }
          )

          if (!response.ok) {
            const errText = await response.text()
            throw new Error(`Stability API error: ${response.status} ${errText}`)
          }

          const data = await response.json()
          if (!data.image) {
            throw new Error("Stability API returned no image data")
          }

          const mimeType = "image/png"
          const extension = "png"
          const tmpDir = os.tmpdir()
          const runId = crypto.randomBytes(8).toString("hex")
          const outputPath = path.join(tmpDir, `llm_image_${runId}.${extension}`)

          try {
            fs.writeFileSync(outputPath, Buffer.from(data.image, "base64"))
            const resultUrl = await uploadToTransloadit(outputPath)

            logger.info(`LLM image response uploaded: ${resultUrl}`)
            return {
              output: {
                url: resultUrl,
                mimeType,
                model: "Stability Core",
              },
            }
          } finally {
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
          }
        }

        const generationRequest: GenerateContentRequest = {
          contents: [{ role: "user", parts }],
        }

        const result = await genModel.generateContent(generationRequest)
        const text = result.response.text()

        logger.info(`LLM response: "${text.slice(0, 200)}"`)
        return { output: text }
      }

      /* ── Crop Image — FFmpeg ─────────────────────── */

      case "crop_image": {
        const imageUrl = extractString(inputs["image-in"])
        if (!imageUrl) {
          throw new Error("Crop image node has no input image")
        }

        const xPercent = (data.xPercent as number) ?? 0
        const yPercent = (data.yPercent as number) ?? 0
        const widthPercent = (data.widthPercent as number) ?? 100
        const heightPercent = (data.heightPercent as number) ?? 100

        const tmpDir = os.tmpdir()
        const runId = crypto.randomBytes(8).toString("hex")
        const inputPath = path.join(tmpDir, `input_${runId}.png`)
        const outputPath = path.join(tmpDir, `output_${runId}.png`)

        try {
          await downloadFile(imageUrl, inputPath)

          // Run FFmpeg to crop based on percentage
          // Crop syntax: crop=w:h:x:y
          const cropFilter = `crop=in_w*${widthPercent}/100:in_h*${heightPercent}/100:in_w*${xPercent}/100:in_h*${yPercent}/100`
          const command = `${getFfmpegPath()} -y -i "${inputPath}" -vf "${cropFilter}" "${outputPath}"`

          logger.info(`Executing FFmpeg: ${command}`)
          await execAsync(command)

          const resultUrl = await uploadToTransloadit(outputPath)
          return { output: resultUrl }
        } finally {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath)
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
        }
      }

      /* ── Extract Frame — FFmpeg ──────────────────── */

      case "extract_frame": {
        const videoUrl = extractString(inputs["video-in"])
        if (!videoUrl) {
          throw new Error("Extract frame node has no input video")
        }

        const tmpDir = os.tmpdir()
        const runId = crypto.randomBytes(8).toString("hex")
        const inputPath = path.join(tmpDir, `input_${runId}.mp4`)
        const outputPath = path.join(tmpDir, `output_${runId}.jpg`)

        try {
          await downloadFile(videoUrl, inputPath)

          const timeArg = (await resolveExtractFrameSeconds(data, inputPath)).toFixed(3)
          const command = `${getFfmpegPath()} -y -ss ${timeArg} -i "${inputPath}" -vframes 1 -q:v 2 "${outputPath}"`

          logger.info(`Executing FFmpeg: ${command}`)
          await execAsync(command)

          const resultUrl = await uploadToTransloadit(outputPath)
          return { output: resultUrl }
        } finally {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath)
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
        }
      }

      /* ── Unknown node type ──────────────────────────────── */

      default: {
        logger.warn(`Unknown node type: ${nodeType}, passing through`)
        return { output: `unknown-type-${nodeType}` }
      }
    }
  },
})
