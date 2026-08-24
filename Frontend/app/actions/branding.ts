'use server'

import { db } from '@/lib/db'
import { branding } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath, revalidateTag, unstable_cache } from 'next/cache'
import { wrapServerAction } from '@/lib/performance-profiler'
import { getCurrentUser } from '@/lib/auth-utils'

// Branding rarely changes (company name, logo, favicon).
// unstable_cache() caches across requests with 5-minute TTL.
// React.cache() is NOT needed here since unstable_cache() already deduplicates.
// Use revalidateTag('branding') in mutation actions to invalidate on update.
const REVALIDATE_SECONDS = 300 // 5 minutes

export const getCachedBranding = unstable_cache(
  async () => {
    const [record] = await db
      .select({
        id: branding.id,
        companyId: branding.companyId,
        companyName: branding.companyName,
        logoUrl: branding.logoUrl,
        logoPublicId: branding.logoPublicId,
        faviconUrl: branding.faviconUrl,
        faviconPublicId: branding.faviconPublicId,
        updatedAt: branding.updatedAt,
      })
      .from(branding)
      .where(eq(branding.companyId, 'default'))
      .limit(1)

    return record ?? null
  },
  ['branding-default'],
  {
    tags: ['branding'],
    revalidate: REVALIDATE_SECONDS,
  },
)

export const getBranding = wrapServerAction('getBranding', async function getBranding() {
  return getCachedBranding()
})

export const updateBranding = wrapServerAction('updateBranding', async function updateBranding(data: {
  companyName?: string
  logoUrl?: string | null
  logoPublicId?: string | null
  faviconUrl?: string | null
  faviconPublicId?: string | null
}) {
  const user = await getCurrentUser()
  if (user.role !== 'admin') throw new Error('Access denied')

  const [existing] = await db
    .select()
    .from(branding)
    .where(eq(branding.companyId, 'default'))
    .limit(1)

  if (existing) {
    await db
      .update(branding)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(branding.companyId, 'default'))
  } else {
    await db
      .insert(branding)
      .values({ companyId: 'default', companyName: 'SupportHub', ...data })
  }

  revalidatePath('/dashboard/admin')
  revalidateTag('branding', { expire: REVALIDATE_SECONDS })
  return { success: true }
})

export const removeBrandingLogo = wrapServerAction('removeBrandingLogo', async function removeBrandingLogo() {
  const user = await getCurrentUser()
  if (user.role !== 'admin') throw new Error('Access denied')

  const [record] = await db
    .select()
    .from(branding)
    .where(eq(branding.companyId, 'default'))
    .limit(1)

  if (record?.logoPublicId) {
    try {
      const cloudinary = (await import('cloudinary')).v2
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      })
      await cloudinary.uploader.destroy(record.logoPublicId)
    } catch (err) {
      console.error('[branding] Failed to delete logo from Cloudinary:', err)
    }
  }

  await db
    .update(branding)
    .set({ logoUrl: null, logoPublicId: null, updatedAt: new Date() })
    .where(eq(branding.companyId, 'default'))

  revalidatePath('/dashboard/admin')
  revalidateTag('branding', { expire: REVALIDATE_SECONDS })
  return { success: true }
})

export const removeBrandingFavicon = wrapServerAction('removeBrandingFavicon', async function removeBrandingFavicon() {
  const user = await getCurrentUser()
  if (user.role !== 'admin') throw new Error('Access denied')

  const [record] = await db
    .select()
    .from(branding)
    .where(eq(branding.companyId, 'default'))
    .limit(1)

  if (record?.faviconPublicId) {
    try {
      const cloudinary = (await import('cloudinary')).v2
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      })
      await cloudinary.uploader.destroy(record.faviconPublicId)
    } catch (err) {
      console.error('[branding] Failed to delete favicon from Cloudinary:', err)
    }
  }

  await db
    .update(branding)
    .set({ faviconUrl: null, faviconPublicId: null, updatedAt: new Date() })
    .where(eq(branding.companyId, 'default'))

  revalidatePath('/dashboard/admin')
  revalidateTag('branding', { expire: REVALIDATE_SECONDS })
  return { success: true }
})

export const resetDefaultBranding = wrapServerAction('resetDefaultBranding', async function resetDefaultBranding() {
  const user = await getCurrentUser()
  if (user.role !== 'admin') throw new Error('Access denied')

  const [record] = await db
    .select()
    .from(branding)
    .where(eq(branding.companyId, 'default'))
    .limit(1)

  // Clean up Cloudinary assets
  if (record?.logoPublicId) {
    try {
      const cloudinary = (await import('cloudinary')).v2
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      })
      await cloudinary.uploader.destroy(record.logoPublicId)
    } catch (err) {
      console.error('[branding] Failed to delete logo:', err)
    }
  }
  if (record?.faviconPublicId) {
    try {
      const cloudinary = (await import('cloudinary')).v2
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      })
      await cloudinary.uploader.destroy(record.faviconPublicId)
    } catch (err) {
      console.error('[branding] Failed to delete favicon:', err)
    }
  }

  await db
    .update(branding)
    .set({
      companyName: 'SupportHub',
      logoUrl: null,
      logoPublicId: null,
      faviconUrl: null,
      faviconPublicId: null,
      updatedAt: new Date(),
    })
    .where(eq(branding.companyId, 'default'))

  revalidatePath('/dashboard/admin')
  revalidateTag('branding', { expire: REVALIDATE_SECONDS })
  return { success: true }
})
