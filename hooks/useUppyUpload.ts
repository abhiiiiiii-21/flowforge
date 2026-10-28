import { useState, useEffect, useRef, useCallback } from "react"
import Uppy, { type Uppy as UppyInstance } from "@uppy/core"
import Transloadit from "@uppy/transloadit"

export type UploadState = "idle" | "uploading" | "success" | "error"

interface UseUppyUploadOptions {
  allowedFileTypes?: string[]
  maxFileSize?: number
  onSuccess?: (url: string, fileName: string) => void
}

type TransloaditUpload = {
  ssl_url?: string
  name?: string
}

type TransloaditResults = {
  [stepName: string]: TransloaditUpload[] | undefined
}

type TransloaditAssembly = {
  uploads?: TransloaditUpload[]
  results?: TransloaditResults
}

type TransloaditError = {
  message?: string
}

type UppyWithTransloaditEvents = UppyInstance & {
  on(
    event: "transloadit:error",
    callback: (assembly: TransloaditAssembly | undefined, errorData: TransloaditError) => void
  ): UppyWithTransloaditEvents
}

export function useUppyUpload(options: UseUppyUploadOptions = {}) {
  const [state, setState] = useState<UploadState>("idle")
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  
  const uppyRef = useRef<UppyInstance | null>(null)
  const optionsRef = useRef(options)

  useEffect(() => {
    optionsRef.current = options
  }, [options])

  useEffect(() => {
    const uppy = new Uppy({
      restrictions: {
        allowedFileTypes: optionsRef.current.allowedFileTypes,
        maxFileSize: optionsRef.current.maxFileSize || 100 * 1024 * 1024,
      },
      autoProceed: true,
    })

    // Uppy 5.x / @uppy/transloadit 5.x: use `assemblyOptions` (not `getAssemblyOptions`).
    // The function fetches signed params from our backend to keep secrets server-side.
    uppy.use(Transloadit, {
      assemblyOptions: async () => {
        const res = await fetch("/api/upload/transloadit-params")
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || "Failed to get upload params")
        }
        return res.json()
      },
      waitForEncoding: true,
      waitForMetadata: true,
    })

    uppy.on("upload", () => {
      setState("uploading")
      setProgress(0)
      setError(null)
    })

    uppy.on("upload-progress", (file, uploadProgress) => {
      if (file && uploadProgress.bytesTotal) {
        setProgress(Math.round((uploadProgress.bytesUploaded / uploadProgress.bytesTotal) * 100))
      }
    })

    // transloadit:complete fires when the assembly finishes (or right after upload if
    // waitForEncoding is false). The uploaded file URL lives in assembly.uploads[].
    uppy.on("transloadit:complete", (assembly) => {
      setState("success")
      // Prefer the exported result (permanent R2 URL) over the temp upload URL
      const exportedResults = assembly?.results?.exported
      const firstExported = Array.isArray(exportedResults) ? exportedResults[0] : undefined
      const firstUpload = Array.isArray(assembly?.uploads) ? assembly.uploads[0] : undefined
      const resultUrl = firstExported?.ssl_url || firstUpload?.ssl_url
      const fileName = firstExported?.name || firstUpload?.name || "uploaded_file"
      
      if (resultUrl && optionsRef.current.onSuccess) {
        optionsRef.current.onSuccess(resultUrl, fileName)
      }
    })

    uppy.on("error", (err) => {
      setState("error")
      setError(err.message)
    })
    
    // transloadit:error is an extended event from the plugin, cast to avoid strict TS issues
    ;(uppy as UppyWithTransloaditEvents).on("transloadit:error", (_assembly, errorData) => {
      setState("error")
      setError(errorData?.message || "Transloadit processing failed")
    })

    uppyRef.current = uppy

    return () => {
      // Uppy 5.x uses `destroy()` for cleanup (not `close()`)
      try {
        uppy.destroy()
      } catch {
        // Silently swallow — component may already be torn down
      }
      uppyRef.current = null
    }
  }, []) // Initialize only once

  const addFile = useCallback((file: File) => {
    if (!uppyRef.current) return
    try {
      uppyRef.current.addFile({
        name: file.name,
        type: file.type,
        data: file,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add file")
      setState("error")
    }
  }, [])

  const reset = useCallback(() => {
    if (uppyRef.current) {
      uppyRef.current.cancelAll()
    }
    setState("idle")
    setProgress(0)
    setError(null)
  }, [])

  return { state, progress, error, addFile, reset }
}
