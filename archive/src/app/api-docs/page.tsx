import { getApiDocs } from "@/lib/swagger";
import { SwaggerUIComponent } from "@/components/SwaggerUI";

export default function ApiDocsPage() {
  const spec = getApiDocs();

  return (
    <div className="min-h-screen bg-white">
      <SwaggerUIComponent spec={spec} />
    </div>
  );
}
