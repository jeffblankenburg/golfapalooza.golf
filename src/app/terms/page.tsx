import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use — Golfapalooza",
  robots: { index: false, follow: false },
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 prose prose-neutral dark:prose-invert">
      <h1>Terms of Use</h1>
      <p>
        <em>Last updated: May 4, 2026</em>
      </p>

      <p>
        These terms govern your use of the Golfapalooza app and Alexa skill
        (collectively, the &ldquo;Service&rdquo;). By using the Service you
        agree to these terms.
      </p>

      <h2>Eligibility and accounts</h2>
      <p>
        The Service is intended for members of the Golfapalooza group. You are
        responsible for keeping your sign-in credentials secure and for all
        activity on your account.
      </p>

      <h2>Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service in violation of any law.</li>
        <li>
          Post content that is unlawful, harassing, or that infringes on
          someone else&rsquo;s rights.
        </li>
        <li>
          Attempt to access accounts or data that don&rsquo;t belong to you, or
          interfere with the Service&rsquo;s normal operation.
        </li>
      </ul>

      <h2>Your content</h2>
      <p>
        You retain ownership of the content you contribute (scores, photos,
        chat messages, articles, etc.). By submitting it you grant us a
        non-exclusive license to host, display, and share it within the
        Service as needed to operate it for you and other Loozers.
      </p>

      <h2>Music and the Alexa skill</h2>
      <p>
        Songs played through the Alexa skill are licensed for use within the
        Golfapalooza group only. You may not redistribute, rebroadcast, or
        commercially exploit the audio.
      </p>

      <h2>Disclaimers</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; without warranties of any
        kind. We don&rsquo;t guarantee that handicaps, scores, or other
        calculated values are free of errors. Use at your own discretion.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, Golfapalooza and its operators
        will not be liable for any indirect, incidental, or consequential
        damages arising out of your use of the Service.
      </p>

      <h2>Termination</h2>
      <p>
        You may stop using the Service at any time. We may suspend or
        terminate access if we reasonably believe you have violated these
        terms.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms from time to time. Continued use of the
        Service after a change means you accept the updated terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions:{" "}
        <a href="mailto:jeff@golfapalooza.golf">jeff@golfapalooza.golf</a>.
      </p>
    </div>
  );
}
