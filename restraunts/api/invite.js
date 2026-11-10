import { bearer, endpoint, HttpError, jsonBody, rpc } from '../server/supabase.js';

export default endpoint(['POST'], async (request, response) => {
  const actor = bearer(request);
  const { restaurant, email, role } = jsonBody(request);
  if (typeof restaurant !== 'string' || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(restaurant)
    || typeof email !== 'string' || email.length > 254 || !['administrator', 'manager', 'staff'].includes(role)) {
    throw new HttpError(400, 'Enter a restaurant, email address and role.');
  }
  const origin = process.env.APP_ORIGIN;
  const emailKey = process.env.RESEND_API_KEY;
  const sender = process.env.INVITATION_FROM;
  const fallback = process.env.ALLOW_INVITATION_LINKS === 'true';
  if (!origin || (!fallback && (!emailKey || !sender))) {
    throw new HttpError(503, 'Invitation email is not configured. Ask the platform owner to set up delivery.');
  }
  if (!URL.canParse(origin)) throw new HttpError(503, 'The invitation site address is invalid.');
  const base = new URL(origin);
  if (base.origin !== origin || (base.protocol !== 'https:' && base.hostname !== 'localhost' && base.hostname !== '127.0.0.1')) {
    throw new HttpError(503, 'The invitation site address is invalid.');
  }
  const invite = await rpc('platform_issue_invite', { p_restaurant: restaurant, p_email: email, p_role: role }, actor);
  const link = `${base.origin}/accept#invite=${invite.token}`;
  if (emailKey && sender) {
    const delivery = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${emailKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: sender, to: [invite.email], subject: `Invitation to ${invite.restaurant}`,
        text: `You have been invited to join ${invite.restaurant}. Sign in using this email address and accept your invitation within 48 hours.\n\n${link}\n\nIf you were not expecting this invitation, you can ignore it.` }),
      signal: AbortSignal.timeout(8000)
    }).catch(() => null);
    if (delivery?.ok) return response.status(201).json({ email: 'submitted' });
    console.error('Invitation email submission failed', { status: delivery?.status });
  }
  response.status(201).json({ email: 'unconfirmed', ...(fallback ? { link } : {}) });
});
