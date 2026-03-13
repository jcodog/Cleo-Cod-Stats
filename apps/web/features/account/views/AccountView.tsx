"use client"

import { UserProfile } from "@clerk/nextjs"
import { IconBrandOpenai } from "@tabler/icons-react"

import { ChatGptAppSettingsSection } from "@/features/account/components/ChatGptAppSettingsSection"

export function AccountView() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <UserProfile path="/account" routing="path">
        <UserProfile.Page
          label="ChatGPT App"
          labelIcon={<IconBrandOpenai className="size-4" />}
          url="chatgpt-app"
        >
          <ChatGptAppSettingsSection />
        </UserProfile.Page>
      </UserProfile>
    </div>
  )
}
