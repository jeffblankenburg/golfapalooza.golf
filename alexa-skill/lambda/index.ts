import { SkillBuilders } from "ask-sdk-core";
import { requestHandlers, errorHandlers } from "./handlers";

const LogRequestInterceptor = {
  process(input: { requestEnvelope: unknown }) {
    console.log("[alexa] request", JSON.stringify(input.requestEnvelope));
  },
};

const LogResponseInterceptor = {
  process(input: { requestEnvelope: unknown }, response: unknown) {
    console.log("[alexa] response", JSON.stringify(response));
  },
};

export const handler = SkillBuilders.custom()
  .addRequestHandlers(...requestHandlers)
  .addErrorHandlers(...errorHandlers)
  .addRequestInterceptors(LogRequestInterceptor)
  .addResponseInterceptors(LogResponseInterceptor)
  .withSkillId(process.env.ALEXA_SKILL_ID!)
  .lambda();
