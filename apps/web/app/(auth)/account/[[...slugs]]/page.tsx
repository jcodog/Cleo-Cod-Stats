"use client"
import { UserProfile } from "@clerk/nextjs";
import { ChatGptAppSettingsSection } from "@/components/settings/chatgpt-app-settings-section";
import { IconBrandOpenai } from "@tabler/icons-react";

const AccountPage = () => {
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
  );
};

export default AccountPage;
