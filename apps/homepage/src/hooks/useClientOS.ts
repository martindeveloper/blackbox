"use client";

import { useEffect, useState } from "react";
import { detectClientOS, type ClientOS } from "@/lib/detectClientOS";

export function useClientOS(): ClientOS {
  const [os, setOs] = useState<ClientOS>("macos");

  useEffect(() => {
    setOs(detectClientOS(navigator.userAgent));
  }, []);

  return os;
}
