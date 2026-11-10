import { configuration, endpoint, HttpError } from '../server/supabase.js';

export default endpoint(['GET'], (_request, response) => {
  const config = configuration();
  if (!config) throw new HttpError(503, 'Connect a Supabase project to finish setup.');
  response.status(200).json(config);
});
