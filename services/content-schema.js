const text = (maxLength, minLength = 1) => ({ type: 'string', minLength, maxLength });
const he = max => ({ ...text(max), pattern: '[א-ת]' });
const array = (items, maxItems, minItems = 0) => ({ type: 'array', items, minItems, maxItems });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const contentSchema = object({
  language: { type: 'string', enum: ['he'] },
  script: he(6000),
  caption: he(1000),
  hashtags: array({ ...text(60), pattern: '^#[א-תA-Za-z0-9_]+$' }, 12, 1),
  visual_plan: array(object({
    description: he(600), on_screen_text: he(150),
    duration_seconds: { type: 'integer', minimum: 1, maximum: 60 },
  }), 12, 1),
  claims: array(object({ text: text(500), source_fact: text(1000) }), 20),
  metadata: object({ tone: he(100), audience: he(200), review_notes: array(he(500), 10) }),
});

// Validate the exact closed JSON Schema above, without coercion or repairing output.
function matches(value, schema) {
  if (schema.type === 'object') {
    return value !== null && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).length === schema.required.length &&
      schema.required.every(key => Object.hasOwn(value,key) && matches(value[key],schema.properties[key]));
  }
  if (schema.type === 'array') return Array.isArray(value) && value.length >= schema.minItems &&
    value.length <= schema.maxItems && value.every(item => matches(item,schema.items));
  if (schema.type === 'integer') return Number.isSafeInteger(value) && value >= schema.minimum && value <= schema.maximum;
  if (schema.type === 'string') return typeof value === 'string' && value.trim().length > 0 &&
    (schema.minLength === undefined || value.length >= schema.minLength) &&
    (schema.maxLength === undefined || value.length <= schema.maxLength) &&
    (!schema.enum || schema.enum.includes(value)) && (!schema.pattern || new RegExp(schema.pattern,'u').test(value));
  return false;
}
function validateContent(value, verifiedFacts = []) {
  if (!matches(value,contentSchema)) return false;
  return value.claims.every(claim => verifiedFacts.includes(claim.source_fact));
}
module.exports = { contentSchema, validateContent };
