import type { ReactNode } from "react";
import StakeoutPathRuntime from "./StakeoutPathRuntime";

export default function ArStakeoutLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <StakeoutPathRuntime />
    </>
  );
}
