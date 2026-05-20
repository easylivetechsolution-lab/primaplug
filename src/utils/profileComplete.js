export const getProfileCompletion = (profile) => {
  if (!profile) return { score: 0, missing: [], complete: false }

  const checks = [
    {
      key: 'full_name',
      label: 'Full name',
      done: !!profile.full_name?.trim()
    },
    {
      key: 'avatar_url',
      label: 'Profile photo',
      done: !!profile.avatar_url
    },
    {
      key: 'location',
      label: 'Your location',
      done: !!profile.location?.trim()
    },
    {
      key: 'skills',
      label: 'At least one skill',
      done: profile.skills?.length > 0
    },
    {
      key: 'phone',
      label: 'Phone number',
      done: !!profile.phone?.trim()
    },
    {
      key: 'bio',
      label: 'Short bio',
      done: !!profile.bio?.trim()
    },
  ]

  const done = checks.filter(c => c.done).length
  const total = checks.length
  const score = Math.round((done / total) * 100)
  const missing = checks.filter(c => !c.done)
  const complete = score >= 80 // 80% minimum to take actions

  return {
    score, missing, complete, done, total,
    selfieVerified: profile?.selfie_verified || false,
    needsSelfie: !profile?.selfie_verified,
    reverificationRequired: profile?.reverification_required || false
  }
}