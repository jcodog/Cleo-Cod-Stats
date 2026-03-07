import { SignIn } from "@clerk/nextjs";

const SignInPage = () => {
  return (
    <div className="flex flex-1 items-center justify-center">
      <SignIn />
    </div>
  );
};

export default SignInPage;
