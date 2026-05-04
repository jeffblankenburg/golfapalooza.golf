import { NextRequest, NextResponse } from "next/server";
import { SkillBuilders } from "ask-sdk-core";
import {
  SkillRequestSignatureVerifier,
  TimestampVerifier,
} from "ask-sdk-express-adapter";
import { requestHandlers, errorHandlers } from "@/lib/alexa/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const skill = SkillBuilders.custom()
  .addRequestHandlers(...requestHandlers)
  .addErrorHandlers(...errorHandlers)
  .withSkillId(process.env.ALEXA_SKILL_ID ?? "")
  .create();

const signatureVerifier = new SkillRequestSignatureVerifier();
const timestampVerifier = new TimestampVerifier();

/**
 * @swagger
 * /api/alexa:
 *   post:
 *     summary: Alexa Skill endpoint (Golfapalooza music)
 *     tags: [Alexa]
 *     description: |
 *       Receives JSON request envelopes from the Alexa Skills Kit and returns
 *       speech + AudioPlayer directives. Verifies Amazon's request signature
 *       and timestamp on every call. No account linking; play counts are
 *       recorded against `song_plays` with `source = 'alexa'` and `user_id = NULL`.
 *     responses:
 *       200:
 *         description: Alexa response envelope
 *       403:
 *         description: Invalid signature or stale timestamp
 */
// Temporary diagnostic — confirms the route is deployed and that
// ALEXA_SKILL_ID is wired up in this environment. Remove once verified.
export async function GET() {
  const expected = "amzn1.ask.skill.52d1842a-dff0-4292-90f3-ef9d2f52bd3f";
  return NextResponse.json({
    routeDeployed: true,
    nodeEnv: process.env.NODE_ENV,
    hasSkillId: Boolean(process.env.ALEXA_SKILL_ID),
    skillIdMatches: process.env.ALEXA_SKILL_ID === expected,
  });
}

export async function POST(req: NextRequest) {
  console.log("[alexa] POST received");
  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  if (process.env.NODE_ENV === "production") {
    try {
      await Promise.all([
        signatureVerifier.verify(rawBody, headers),
        timestampVerifier.verify(rawBody),
      ]);
      console.log("[alexa] verification passed");
    } catch (err) {
      console.error("[alexa] verification failed", err);
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  let envelope;
  try {
    envelope = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  console.log("[alexa] request type:", envelope?.request?.type);
  console.log(
    "[alexa] envelope skillId:",
    envelope?.session?.application?.applicationId ??
      envelope?.context?.System?.application?.applicationId
  );
  console.log("[alexa] env skillId set:", Boolean(process.env.ALEXA_SKILL_ID));

  try {
    const response = await skill.invoke(envelope);
    console.log("[alexa] invoke ok");
    return NextResponse.json(response);
  } catch (err) {
    console.error("[alexa] skill.invoke failed", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
