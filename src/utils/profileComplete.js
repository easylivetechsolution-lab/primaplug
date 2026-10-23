export const getProfileCompletion = (profile) => {
  if (!profile) return { score: 0, missing: [], requiredMissing: ['Full name', 'Username', 'At least one skill'], complete: false }

  const checks = [
    {
      key: 'full_name',
      label: 'Full name',
      done: !!profile.full_name?.trim()
    },
    {
      key: 'username',
      label: 'Username',
      done: !!profile.username?.trim()
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
  // These are the minimum details needed before applying or posting. Photo,
  // location, phone, and bio improve trust and discovery but should not silently
  // block marketplace actions. Selfie eligibility is checked separately.
  const requiredMissing = [
    !profile.full_name?.trim() && 'Full name',
    !profile.username?.trim() && 'Username',
    !(profile.skills?.length > 0) && 'At least one skill',
  ].filter(Boolean)
  const complete = requiredMissing.length === 0

  return {
    score, missing, requiredMissing, complete, done, total,
    selfieVerified: profile?.selfie_verified || false,
    needsSelfie: !profile?.selfie_verified,
    reverificationRequired: profile?.reverification_required || false
  }
}

export const needsProfileSetup = (profile) =>
  !profile?.full_name?.trim() || !profile?.username?.trim() || !(profile?.skills?.length > 0)

// Keep the existing referral reward threshold independent from the minimum
// fields required to enter the marketplace. This preserves the prior rule:
// five of the original six profile fields must be present.
export const isReferralProfileComplete = (profile) => {
  if (!profile) return false
  const fields = [
    !!profile.full_name?.trim(),
    !!profile.avatar_url,
    !!profile.location?.trim(),
    profile.skills?.length > 0,
    !!profile.phone?.trim(),
    !!profile.bio?.trim(),
  ]
  return fields.filter(Boolean).length / fields.length >= 0.8
}
