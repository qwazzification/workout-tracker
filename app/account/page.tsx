'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

const inputClass =
  'border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 w-full'
const cardClass =
  'bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mb-4'
const saveBtn =
  'bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors'

export default function AccountPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Profile fields stored in Supabase user_metadata
  const [profile, setProfile] = useState({
    displayName: '',
    gender: '',
    weight: '',
    height: '',
  })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')

  // Email change
  const [newEmail, setNewEmail] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailMsg, setEmailMsg] = useState('')

  // Password change
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState('')

  // Account deletion
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/login'); return }
      setUser(user)
      const m = user.user_metadata ?? {}
      setProfile({
        displayName: (m.display_name as string) ?? '',
        gender: (m.gender as string) ?? '',
        weight: (m.weight as string) ?? '',
        height: (m.height as string) ?? '',
      })
      setLoading(false)
    })
  }, [])

  async function saveProfile() {
    setProfileSaving(true)
    const { error } = await supabase.auth.updateUser({
      data: {
        display_name: profile.displayName.trim() || null,
        gender: profile.gender || null,
        weight: profile.weight || null,
        height: profile.height || null,
      },
    })
    setProfileSaving(false)
    setProfileMsg(error ? error.message : 'Saved!')
    setTimeout(() => setProfileMsg(''), 2500)
  }

  async function changeEmail() {
    if (!newEmail.trim()) return
    setEmailSaving(true)
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() })
    setEmailSaving(false)
    if (error) {
      setEmailMsg(error.message)
    } else {
      setEmailMsg('Check your new inbox for a confirmation link.')
      setNewEmail('')
    }
  }

  async function changePassword() {
    if (!newPassword || newPassword !== confirmPassword) return
    setPasswordSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPasswordSaving(false)
    if (error) {
      setPasswordMsg(error.message)
    } else {
      setPasswordMsg('Password updated successfully.')
      setNewPassword('')
      setConfirmPassword('')
    }
    setTimeout(() => setPasswordMsg(''), 3000)
  }

  async function deleteAccount() {
    if (deleteConfirm !== 'DELETE' || !user) return
    setDeleting(true)
    const uid = user.id
    // Delete user data in dependency order
    await supabase.from('workout_logs').delete().eq('user_id', uid)
    await supabase.from('routines').delete().eq('user_id', uid)
    await supabase.from('exercises').delete().eq('user_id', uid)
    // Sign out — auth record removal requires a server-side admin call
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (loading) return <div className="text-gray-400 dark:text-gray-500 text-sm">Loading...</div>

  const passwordsMatch = newPassword === confirmPassword
  const passwordValid = newPassword.length >= 6

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="grid grid-cols-2 items-center w-full">
        <div className="justify-self-start">
          <Link
            href="/progress"
            className="flex items-center gap-2 h-6 px-3 rounded-lg bg-gray-800 border border-gray-500 text-gray-400 dark:text-gray-500 hover:text-gray-300 text-xs shrink-0 transition-colors"
          >
            <span>←</span> Profile
          </Link>
        </div>
        <div className="w-full" />
      </div>

      <h1 className="flex justify-start my-4 text-xl font-bold text-gray-900 dark:text-white">
        Account
      </h1>

      {/* ── Profile info ─────────────────────────────────────────────── */}
      <div className={cardClass}>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Profile</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Display name</label>
            <input
              value={profile.displayName}
              onChange={(e) => setProfile((p) => ({ ...p, displayName: e.target.value }))}
              placeholder="Your name"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Gender</label>
              <select
                value={profile.gender}
                onChange={(e) => setProfile((p) => ({ ...p, gender: e.target.value }))}
                className={inputClass}
              >
                <option value="">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Body weight (lbs)</label>
              <input
                type="number"
                inputMode="decimal"
                value={profile.weight}
                onChange={(e) => setProfile((p) => ({ ...p, weight: e.target.value }))}
                placeholder="—"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Height (inches)</label>
            <input
              type="number"
              inputMode="decimal"
              value={profile.height}
              onChange={(e) => setProfile((p) => ({ ...p, height: e.target.value }))}
              placeholder="—"
              className={inputClass}
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button onClick={saveProfile} disabled={profileSaving} className={saveBtn}>
              {profileSaving ? 'Saving…' : 'Save changes'}
            </button>
            {profileMsg && (
              <span className="text-xs text-gray-500 dark:text-gray-400">{profileMsg}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Email ────────────────────────────────────────────────────── */}
      <div className={cardClass}>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Email address</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Current: <span className="font-medium text-gray-600 dark:text-gray-300">{user?.email}</span></p>
        <div className="space-y-2">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="New email address"
            className={inputClass}
          />
          <div className="flex items-center gap-3">
            <button onClick={changeEmail} disabled={emailSaving || !newEmail.trim()} className={saveBtn}>
              {emailSaving ? 'Sending…' : 'Change email'}
            </button>
            {emailMsg && <span className="text-xs text-gray-500 dark:text-gray-400">{emailMsg}</span>}
          </div>
        </div>
      </div>

      {/* ── Password ─────────────────────────────────────────────────── */}
      <div className={cardClass}>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Change password</h2>
        <div className="space-y-2">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (min 6 characters)"
            className={inputClass}
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            className={inputClass}
          />
          {newPassword && confirmPassword && !passwordsMatch && (
            <p className="text-xs text-red-500 dark:text-red-400">Passwords don&apos;t match</p>
          )}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={changePassword}
              disabled={passwordSaving || !passwordValid || !passwordsMatch || !newPassword}
              className={saveBtn}
            >
              {passwordSaving ? 'Updating…' : 'Update password'}
            </button>
            {passwordMsg && <span className="text-xs text-gray-500 dark:text-gray-400">{passwordMsg}</span>}
          </div>
        </div>
      </div>

      {/* ── Danger zone ──────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-red-200 dark:border-red-900">
        <h2 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-1">Danger zone</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
          Permanently deletes all your workouts, sets, routines, and custom exercises. This cannot be undone.
          Type <span className="font-mono font-bold text-gray-600 dark:text-gray-300">DELETE</span> to confirm.
        </p>
        <div className="space-y-2">
          <input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="Type DELETE to confirm"
            className={`${inputClass} border-red-300 dark:border-red-800 focus:ring-red-500`}
          />
          <button
            onClick={deleteAccount}
            disabled={deleting || deleteConfirm !== 'DELETE'}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {deleting ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </div>
    </div>
  )
}
