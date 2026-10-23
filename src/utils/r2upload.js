import { supabase } from '../supabase'
import { edgeFunctionErrorMessage } from './edgeFunctionErrors'

export async function uploadToR2(file, folder = 'uploads') {
  const { data, error } = await supabase.functions.invoke('r2-presign', {
    body: { fileName: file.name, contentType: file.type || 'application/octet-stream', folder },
  })
  if (error) throw new Error(await edgeFunctionErrorMessage(error, 'Could not prepare this upload. Please try again.'))
  if (!data?.uploadUrl) throw new Error('Could not prepare this upload. Please try again.')

  const res = await fetch(data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!res.ok) throw new Error('Upload to R2 failed: ' + res.statusText)

  return data.publicUrl
}

export async function uploadBlobToR2(blob, fileName, contentType, folder = 'uploads') {
  const { data, error } = await supabase.functions.invoke('r2-presign', {
    body: { fileName, contentType, folder },
  })
  if (error) throw new Error(await edgeFunctionErrorMessage(error, 'Could not prepare this upload. Please try again.'))
  if (!data?.uploadUrl) throw new Error('Could not prepare this upload. Please try again.')

  const res = await fetch(data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  })
  if (!res.ok) throw new Error('Upload to R2 failed: ' + res.statusText)

  return data.publicUrl
}
