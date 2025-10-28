import React from "react"
import { PostHogProvider } from "posthog-js/react"
import { useSettings } from "../SettingsProvider"

export const PosthogProviderWrapper = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const { settings } = useSettings()
  const posthogDisabled = !settings["posthog.enabled"] ?? true

  if (!settings["posthog.api.key"]) {
    return <>{children}</>
  }

  return (
    <PostHogProvider
      apiKey={settings["posthog.api.key"]}
      options={{
        disable_persistence: posthogDisabled,
        disable_session_recording: posthogDisabled,
        disable_surveys: posthogDisabled,
        advanced_disable_decide: posthogDisabled,
        advanced_disable_feature_flags: posthogDisabled,
        advanced_disable_feature_flags_on_first_load: posthogDisabled,
        advanced_disable_toolbar_metrics: posthogDisabled,
        autocapture: !posthogDisabled,
        capture_pageview: !posthogDisabled,
        capture_pageleave: !posthogDisabled,
      }}
    >
      {children}
    </PostHogProvider>
  )
}
