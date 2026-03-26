"use client";

import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

interface SwaggerUIComponentProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spec: any;
}

export function SwaggerUIComponent({ spec }: SwaggerUIComponentProps) {
  return <SwaggerUI spec={spec} />;
}
