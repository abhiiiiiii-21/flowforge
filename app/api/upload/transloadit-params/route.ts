import crypto from "crypto"

export async function GET() {
  const authKey = process.env.TRANSLOADIT_AUTH_KEY
  const secret = process.env.TRANSLOADIT_SECRET

  if (!authKey || !secret) {
    return Response.json(
      { error: "Transloadit credentials missing in server environment" },
      { status: 500 }
    )
  }

  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  const r2Url = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "")

  const paramsObject = {
    auth: {
      key: authKey,
      expires,
    },
    steps: {
      // ":original" is a Transloadit reserved step name for the upload handler.
      ":original": {
        robot: "/upload/handle",
      },
      // Export to Cloudflare R2 for permanent URLs.
      // "nextflow_r2" must match the Template Credential name in Transloadit console.
      exported: {
        robot: "/cloudflare/store",
        use: ":original",
        credentials: "nextflow_r2",
        path: "uploads/${unique_prefix}/${file.url_name}",
        url_prefix: r2Url ? `${r2Url}/` : "",
        result: true,
      },
    },
  }

  const paramsString = JSON.stringify(paramsObject)

  // Transloadit signature authentication uses sha384
  const signature = crypto
    .createHmac("sha384", secret)
    .update(Buffer.from(paramsString, "utf-8"))
    .digest("hex")

  return Response.json({
    params: paramsString,
    signature: `sha384:${signature}`,
  })
}
