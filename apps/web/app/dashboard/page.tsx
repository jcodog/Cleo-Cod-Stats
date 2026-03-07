import { UserButton } from "@clerk/nextjs";

const DashboardHome = () => {
  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <h1>This is the dashboard home</h1>
      <p>
        This is currently a work in progress for your stats. Please have
        patience as we add new features
      </p>
      <UserButton
        showName
        userProfileMode="navigation"
        userProfileUrl="/account"
      />
    </div>
  );
};

export default DashboardHome;
