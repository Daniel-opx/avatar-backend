const { contentSchema } = require('./content-schema');
class ProviderError extends Error {
  constructor(code, { retryable = false, uncertain = false, usage, requestId } = {}) {
    super('Content provider failed');
    Object.assign(this, { code, retryable, uncertain, usage, requestId });
  }
}
function usageOf(body) {
  const u = body?.usage;
  return u && Number.isSafeInteger(u.input_tokens) && u.input_tokens >= 0 &&
    Number.isSafeInteger(u.output_tokens) && u.output_tokens >= 0
    ? { input: u.input_tokens, output: u.output_tokens } : null;
}
function createOpenAI({ apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new ProviderError('PROVIDER_UNCONFIGURED');
  return {
    async generate({ model, instructions, input, maxOutputTokens, signal }) {
      let response;
      try {
        response = await fetchImpl('https://api.openai.com/v1/responses', {
          method: 'POST', redirect: 'error', signal,
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ model, instructions, input: JSON.stringify(input), store: false,
            max_output_tokens: maxOutputTokens,
            text: { format: { type: 'json_schema', name: 'hebrew_marketing_content', strict: true, schema: contentSchema } } }),
        });
      } catch { throw new ProviderError('PROVIDER_TRANSPORT', { uncertain: true }); }
      const requestId = response.headers.get('x-request-id');
      // Explicit rejection may be retried; network/5xx outcomes may already be billable.
      if (!response.ok) {
        let quota = false;
        if (response.status === 429) {
          try { quota = (await response.json()).error?.code === 'insufficient_quota'; } catch {}
        }
        throw new ProviderError(quota ? 'PROVIDER_QUOTA' : response.status === 429 ? 'PROVIDER_RATE_LIMIT' :
          response.status >= 500 ? 'PROVIDER_UNCERTAIN' : 'PROVIDER_REJECTED',
        { retryable: response.status === 429 && !quota, uncertain: response.status >= 500, requestId });
      }
      let body;
      try { body = await response.json(); } catch { throw new ProviderError('MALFORMED_RESPONSE', { requestId }); }
      const usage = usageOf(body);
      const parts = Array.isArray(body.output) ? body.output.filter(x => x.type === 'message').flatMap(x => x.content || []) : [];
      if (parts.some(p => p.type === 'refusal')) throw new ProviderError('PROVIDER_REFUSAL', { usage, requestId });
      if (body.status !== 'completed') throw new ProviderError('PROVIDER_INCOMPLETE', { usage, requestId });
      const output = parts.filter(p => p.type === 'output_text');
      let content;
      try {
        if (output.length !== 1 || typeof output[0].text !== 'string' || output[0].text.length > 65536) throw new Error();
        content = JSON.parse(output[0].text);
      } catch { throw new ProviderError('MALFORMED_CONTENT', { usage, requestId }); }
      return { content, usage, requestId, model: body.model || model };
    },
  };
}
module.exports = { createOpenAI, ProviderError };
