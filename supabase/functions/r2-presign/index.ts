import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'

const ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID')!
const ACCESS_KEY = Deno.env.get('R2_ACCESS_KEY_ID')!
const SECRET_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY')!
const BUCKET = 'prima-files'
const PUBLIC_URL = 'https://pub-bcdbcd3dbd3148c28060148c0929cc03.r2.dev'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

  try {
    const { fileName, contentType, folder = 'uploads' } = await req.json()

    const ext = (fileName as string).split('.').pop()!.toLowerCase()
    const key = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`

    const aws = new AwsClient({
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
      region: 'auto',
      service: 's3',
    })

    const endpoint = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/${key}`

    const presigned = await aws.sign(
      new Request(endpoint, { method: 'PUT', headers: { 'Content-Type': contentType } }),
      { aws: { signQuery: true } }
    )

    return new Response(
      JSON.stringify({ uploadUrl: presigned.url, publicUrl: `${PUBLIC_URL}/${key}` }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
