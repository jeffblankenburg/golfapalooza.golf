import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Golfapalooza",
  robots: { index: false, follow: false },
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 prose prose-neutral dark:prose-invert">
      <h1>Privacy Policy</h1>
      <p>
        <em>Last updated: May 4, 2026</em>
      </p>

      <p>
        Golfapalooza (&ldquo;we&rdquo;, &ldquo;us&rdquo;) operates a private
        app and Alexa skill for members of the Golfapalooza golf group
        (&ldquo;Loozers&rdquo;). This policy describes what we collect, how we
        use it, and the choices you have.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account info</strong> &mdash; your name, mobile phone number
          (used for SMS sign-in), and an optional avatar photo.
        </li>
        <li>
          <strong>Activity in the app</strong> &mdash; golf rounds, hole-by-hole
          scores, attendance, financial records, chat messages, poll responses,
          photos, articles, nominations, and similar Loozer activity you create.
        </li>
        <li>
          <strong>Technical data</strong> &mdash; standard server logs (IP
          address, browser, timestamps) used for security and debugging.
        </li>
        <li>
          <strong>Alexa skill</strong> &mdash; when you use the Alexa skill we
          do not collect or store any personal information from your Amazon
          account. We log only an anonymous record of which song was played.
          Amazon&rsquo;s own privacy policy governs information Amazon
          collects via your Alexa devices.
        </li>
      </ul>

      <h2>How we use your information</h2>
      <ul>
        <li>To operate the app and the Alexa skill.</li>
        <li>
          To calculate handicaps, leaderboards, and other group statistics.
        </li>
        <li>To share your contributions with other Loozers in the group.</li>
        <li>
          To send transactional notifications (sign-in codes, tee-time
          reminders, chat alerts you opted into).
        </li>
      </ul>

      <h2>Who we share it with</h2>
      <p>
        Your in-app activity is visible to other Loozers in the group. We do
        not sell your information or share it with advertisers. Service
        providers we rely on to operate the app:
      </p>
      <ul>
        <li>Supabase &mdash; database, authentication, and file storage.</li>
        <li>Vercel &mdash; web app hosting.</li>
        <li>Amazon Web Services &mdash; Alexa skill backend (Lambda).</li>
        <li>
          Telephony providers used by Supabase Auth to deliver SMS sign-in
          codes.
        </li>
      </ul>
      <p>
        A subset of group activity is visible without sign-in on our spectator
        pages (event info, schedules, public articles, scoreboards). Personal
        contact info, financials, and private messages are never shown there.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your information for as long as your account is active. When
        you ask us to delete your account, we remove your personal information
        from our systems within a reasonable period; aggregate or anonymized
        records (such as historical leaderboards) may remain.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>You can update your profile and avatar at any time in the app.</li>
        <li>
          You can ask us to access, correct, or delete your account by
          contacting us at the address below.
        </li>
        <li>
          You can disable the Alexa skill at any time in the Alexa app under
          Skills &amp; Games.
        </li>
      </ul>

      <h2>Children</h2>
      <p>
        Golfapalooza is not directed at children under 13 and we do not
        knowingly collect personal information from them.
      </p>

      <h2>Security</h2>
      <p>
        We use industry-standard measures to protect your information,
        including encrypted transport and access controls. No system is
        perfectly secure; please use a strong, unique password where applicable
        and notify us if you suspect unauthorized access.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If we make material changes we will post the updated policy at this
        URL and update the date above.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or requests:{" "}
        <a href="mailto:jeff@golfapalooza.golf">jeff@golfapalooza.golf</a>.
      </p>
    </div>
  );
}
