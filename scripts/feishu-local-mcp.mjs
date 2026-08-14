#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));

const tools = [
  {
    name: 'feishu_bot_diagnostics',
    description: 'Read a non-sensitive health summary for Craig AI 助理: activation status and aggregate organization/chat counts. Use this only when the official Feishu MCP does not provide the required bot health detail.',
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
  },
  {
    name: 'feishu_bot_group_history',
    description: 'Read one page of history from a specified group containing Craig AI 助理. Defaults to metadata-only; set include_content true only for a stated, scoped analysis purpose. Use official chat-list/member tools first to identify the group.',
    inputSchema: {
      type: 'object',
      properties: {
        chat_id: {type: 'string', minLength: 1, description: 'The explicit Feishu chat ID to inspect.'},
        page_size: {type: 'integer', minimum: 10, maximum: 50, default: 20, description: 'Messages to retrieve; 10–50 only.'},
        include_content: {type: 'boolean', default: false, description: 'Whether to return message bodies. Defaults to false for privacy.'},
      },
      required: ['chat_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'feishu_v2_chat_messages',
    description: 'Read up to 500 messages from one explicitly specified Feishu chat using Craig\'s current user authorization. Reads above 50 messages require an explicit start and end time and are fetched in bounded pages. This tool never enumerates chats or sends messages.',
    inputSchema: {
      type: 'object',
      properties: {
        chat_id: {type: 'string', minLength: 1, description: 'The explicit Feishu chat ID to inspect.'},
        page_size: {type: 'integer', minimum: 1, maximum: 500, default: 50, description: 'Total messages to retrieve; 1–500. A value above 50 requires start_time and end_time.'},
        start_time: {type: 'integer', minimum: 0, description: 'Optional inclusive Unix timestamp in seconds.'},
        end_time: {type: 'integer', minimum: 0, description: 'Optional inclusive Unix timestamp in seconds.'},
      },
      required: ['chat_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'feishu_create_email_draft',
    description: 'Create one unsent Feishu Mail draft in Craig\'s mailbox through the official API, optionally with explicitly selected local file attachments. Use only after Craig has reviewed the exact recipients, subject, body, and every attachment filename/size and explicitly approved creation. This tool cannot send, update, or delete email drafts.',
    inputSchema: {
      type: 'object',
      properties: {
        mailbox: {type: 'string', minLength: 3, description: 'Optional mailbox address; defaults to Craig\'s Feishu mailbox.'},
        to: {type: 'array', minItems: 1, maxItems: 50, items: {type: 'string', minLength: 3}, description: 'Explicit recipient email addresses.'},
        cc: {type: 'array', maxItems: 50, items: {type: 'string', minLength: 3}, description: 'Optional explicit CC recipient email addresses.'},
        bcc: {type: 'array', maxItems: 50, items: {type: 'string', minLength: 3}, description: 'Optional explicit BCC recipient email addresses.'},
        attachment_paths: {type: 'array', minItems: 1, maxItems: 10, items: {type: 'string', minLength: 1}, description: 'Optional explicit absolute paths to regular local attachment files. The aggregate source-file limit is 20 MiB.'},
        subject: {type: 'string', minLength: 1, description: 'The exact approved email subject.'},
        body_plain_text: {type: 'string', minLength: 1, description: 'The exact approved plain-text email body.'},
        confirmation: {type: 'string', const: 'create_draft', description: 'Must be create_draft after Craig explicitly approves this exact draft.'},
      },
      required: ['to', 'subject', 'body_plain_text', 'confirmation'],
      additionalProperties: false,
    },
  },
  {
    name: 'feishu_minute_transcript',
    description: 'Read the text transcript of one explicitly specified Feishu Minutes item through the official API. The minute token must come from a Minutes URL Craig supplied. This tool never searches Minutes, downloads audio/video, or writes to Feishu.',
    inputSchema: {
      type: 'object',
      properties: {
        minute_token: {type: 'string', minLength: 24, maxLength: 24, description: 'The exact 24-character token from a Feishu Minutes URL.'},
        format: {type: 'string', enum: ['txt', 'srt'], default: 'txt', description: 'Requested transcript format.'},
        need_speaker: {type: 'boolean', default: false, description: 'Whether to include speaker labels.'},
        need_timestamp: {type: 'boolean', default: false, description: 'Whether to include timestamps.'},
      },
      required: ['minute_token'],
      additionalProperties: false,
    },
  },
  {
    name: 'feishu_company_directory',
    description: 'Read one bounded page of active employees in the Craig AI 助理 app-visible Feishu directory. Returns only name, work email, user_id, open_id, and employment_id; never writes, exports, or persists employee data.',
    inputSchema: {
      type: 'object',
      properties: {
        page_size: {type: 'integer', minimum: 1, maximum: 500, default: 100, description: 'Employees to read in this page; 1–500 only.'},
        page_token: {type: 'string', minLength: 1, description: 'Optional opaque continuation token returned by the prior page.'},
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'feishu_send_direct_message',
    description: 'Send one exact, explicitly approved plain-text direct message as Craig AI 助理 to one uniquely matched app-visible employee. Requires recipient_name, exact text, and confirmation send_direct_message. Cannot send to groups, multiple recipients, or send attachments, cards, replies, forwards, edits, or deletes.',
    inputSchema: {
      type: 'object',
      properties: {
        recipient_name: {type: 'string', minLength: 1, maxLength: 255, description: 'Exact employee name. The send fails if it does not match exactly one active app-visible employee.'},
        text: {type: 'string', minLength: 1, maxLength: 2000, description: 'Exact approved plain-text message.'},
        confirmation: {type: 'string', const: 'send_direct_message', description: 'Must be send_direct_message after Craig explicitly approves this exact recipient and text.'},
      },
      required: ['recipient_name', 'text', 'confirmation'],
      additionalProperties: false,
    },
  },
  {
    name: 'feishu_send_user_direct_message',
    description: 'Send one exact, explicitly approved plain-text direct message as Craig through his Feishu user authorization to one uniquely matched app-visible employee. Requires recipient_name, exact text, and confirmation send_user_direct_message. Cannot send to groups, multiple recipients, or send attachments, cards, replies, forwards, edits, or deletes.',
    inputSchema: {
      type: 'object',
      properties: {
        recipient_name: {type: 'string', minLength: 1, maxLength: 255, description: 'Exact employee name. The send fails if it does not match exactly one active app-visible employee.'},
        text: {type: 'string', minLength: 1, maxLength: 2000, description: 'Exact approved plain-text message.'},
        confirmation: {type: 'string', const: 'send_user_direct_message', description: 'Must be send_user_direct_message after Craig explicitly approves this exact recipient and text.'},
      },
      required: ['recipient_name', 'text', 'confirmation'],
      additionalProperties: false,
    },
  },
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id, value) {
  send({jsonrpc: '2.0', id, result: value});
}

function error(id, code, message) {
  send({jsonrpc: '2.0', id, error: {code, message}});
}

function toolError(message) {
  return {content: [{type: 'text', text: message}], isError: true};
}

function validateExactKeys(args, allowed) {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return 'Tool arguments must be an object.';
  const unexpected = Object.keys(args).filter((key) => !allowed.includes(key));
  return unexpected.length ? `Unsupported argument: ${unexpected[0]}` : null;
}

async function runHelper(file, args) {
  try {
    const {stdout} = await execFileAsync(path.join(scriptDir, file), args, {maxBuffer: 16 * 1024 * 1024});
    return {content: [{type: 'text', text: stdout.trim() || '{}'}]};
  } catch (helperError) {
    const stderr = typeof helperError?.stderr === 'string' ? helperError.stderr.trim() : '';
    const safeDraftDiagnostic = /^FEISHU_DRAFT_ERROR stage=[a-z_]+ feishu_code=(?:-?\d{1,12}|unknown) http_status=(?:\d{3}|unknown)$/.exec(stderr);
    if (safeDraftDiagnostic) return toolError(safeDraftDiagnostic[0]);
    const safeMinuteDiagnostic = /^FEISHU_MINUTE_ERROR stage=[a-z_]+ feishu_code=(?:-?\d{1,12}|unknown) http_status=(?:\d{3}|unknown)$/.exec(stderr);
    if (safeMinuteDiagnostic) return toolError(safeMinuteDiagnostic[0]);
    const safeDirectoryDiagnostic = /^FEISHU_DIRECTORY_ERROR stage=[a-z_]+ feishu_code=(?:-?\d{1,12}|unknown) http_status=(?:\d{3}|unknown)$/.exec(stderr);
    if (safeDirectoryDiagnostic) return toolError(safeDirectoryDiagnostic[0]);
    const safeDirectMessageDiagnostic = /^FEISHU_DIRECT_MESSAGE_ERROR stage=[a-z_]+ feishu_code=(?:-?\d{1,12}|unknown) http_status=(?:\d{3}|unknown)$/.exec(stderr);
    if (safeDirectMessageDiagnostic) return toolError(safeDirectMessageDiagnostic[0]);
    const safeUserDirectMessageDiagnostic = /^FEISHU_USER_DIRECT_MESSAGE_ERROR stage=[a-z_]+ feishu_code=(?:-?\d{1,12}|unknown) http_status=(?:\d{3}|unknown)$/.exec(stderr);
    if (safeUserDirectMessageDiagnostic) return toolError(safeUserDirectMessageDiagnostic[0]);
    return toolError('Feishu local helper failed. Check authorization, the requested group, and the bundle diagnostics.');
  }
}

async function callTool(name, args) {
  if (name === 'feishu_bot_diagnostics') {
    const validationError = validateExactKeys(args, []);
    return validationError ? toolError(validationError) : runHelper('feishu-bot-diagnostics', []);
  }

  if (name === 'feishu_bot_group_history') {
    const validationError = validateExactKeys(args, ['chat_id', 'page_size', 'include_content']);
    if (validationError) return toolError(validationError);
    if (typeof args.chat_id !== 'string' || !args.chat_id.trim()) return toolError('chat_id must be a non-empty string.');
    const pageSize = args.page_size ?? 20;
    if (!Number.isInteger(pageSize) || pageSize < 10 || pageSize > 50) return toolError('page_size must be an integer between 10 and 50.');
    const includeContent = args.include_content ?? false;
    if (typeof includeContent !== 'boolean') return toolError('include_content must be a boolean.');
    const helperArgs = ['--chat-id', args.chat_id, '--page-size', String(pageSize)];
    if (!includeContent) helperArgs.push('--metadata-only');
    return runHelper('fetch-feishu-chat-history', helperArgs);
  }

  if (name === 'feishu_v2_chat_messages') {
    const validationError = validateExactKeys(args, ['chat_id', 'page_size', 'start_time', 'end_time']);
    if (validationError) return toolError(validationError);
    if (typeof args.chat_id !== 'string' || !args.chat_id.trim()) return toolError('chat_id must be a non-empty string.');
    const pageSize = args.page_size ?? 50;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) return toolError('page_size must be an integer between 1 and 500.');
    for (const key of ['start_time', 'end_time']) {
      if (args[key] !== undefined && (!Number.isInteger(args[key]) || args[key] < 0)) return toolError(`${key} must be a non-negative integer Unix timestamp.`);
    }
    if (args.start_time !== undefined && args.end_time !== undefined && args.end_time < args.start_time) {
      return toolError('end_time must be greater than or equal to start_time.');
    }
    if (pageSize > 50 && (args.start_time === undefined || args.end_time === undefined)) {
      return toolError('start_time and end_time are required when page_size exceeds 50.');
    }
    const helperArgs = ['--chat-id', args.chat_id.trim(), '--page-size', String(pageSize)];
    if (args.start_time !== undefined) helperArgs.push('--start-time', String(args.start_time));
    if (args.end_time !== undefined) helperArgs.push('--end-time', String(args.end_time));
    return runHelper('fetch-feishu-v2-chat-messages', helperArgs);
  }

  if (name === 'feishu_create_email_draft') {
    const validationError = validateExactKeys(args, ['mailbox', 'to', 'cc', 'bcc', 'attachment_paths', 'subject', 'body_plain_text', 'confirmation']);
    if (validationError) return toolError(validationError);
    if (!Array.isArray(args.to) || args.to.length < 1 || args.to.length > 50 || !args.to.every((value) => typeof value === 'string')) {
      return toolError('to must contain between 1 and 50 email addresses.');
    }
    for (const key of ['cc', 'bcc']) {
      if (args[key] !== undefined && (!Array.isArray(args[key]) || args[key].length > 50 || !args[key].every((value) => typeof value === 'string'))) {
        return toolError(`${key} must contain at most 50 email addresses.`);
      }
    }
    if (args.attachment_paths !== undefined && (!Array.isArray(args.attachment_paths) || args.attachment_paths.length < 1 || args.attachment_paths.length > 10 || !args.attachment_paths.every((value) => typeof value === 'string' && value.startsWith('/')))) {
      return toolError('attachment_paths must be an array containing 1 to 10 absolute file paths.');
    }
    if (args.mailbox !== undefined && (typeof args.mailbox !== 'string' || !args.mailbox.trim())) return toolError('mailbox must be a non-empty string.');
    if (typeof args.subject !== 'string' || !args.subject.trim()) return toolError('subject must be a non-empty string.');
    if (typeof args.body_plain_text !== 'string' || !args.body_plain_text.trim()) return toolError('body_plain_text must be a non-empty string.');
    if (args.confirmation !== 'create_draft') return toolError('confirmation must equal create_draft after Craig explicitly approves this exact draft.');
    const helperArgs = ['--to-json', JSON.stringify(args.to), '--subject', args.subject, '--body-plain-text', args.body_plain_text];
    if (args.mailbox !== undefined) helperArgs.push('--mailbox', args.mailbox);
    if (args.cc !== undefined) helperArgs.push('--cc-json', JSON.stringify(args.cc));
    if (args.bcc !== undefined) helperArgs.push('--bcc-json', JSON.stringify(args.bcc));
    if (args.attachment_paths !== undefined) helperArgs.push('--attachment-paths-json', JSON.stringify(args.attachment_paths));
    return runHelper('create-feishu-email-draft', helperArgs);
  }

  if (name === 'feishu_minute_transcript') {
    const validationError = validateExactKeys(args, ['minute_token', 'format', 'need_speaker', 'need_timestamp']);
    if (validationError) return toolError(validationError);
    if (typeof args.minute_token !== 'string' || !/^[A-Za-z0-9]{24}$/u.test(args.minute_token)) {
      return toolError('minute_token must be a 24-character alphanumeric Minutes token.');
    }
    const format = args.format ?? 'txt';
    if (format !== 'txt' && format !== 'srt') return toolError('format must be txt or srt.');
    for (const key of ['need_speaker', 'need_timestamp']) {
      if (args[key] !== undefined && typeof args[key] !== 'boolean') return toolError(`${key} must be a boolean.`);
    }
    const helperArgs = ['--minute-token', args.minute_token, '--format', format];
    if (args.need_speaker) helperArgs.push('--need-speaker');
    if (args.need_timestamp) helperArgs.push('--need-timestamp');
    return runHelper('fetch-feishu-minute-transcript', helperArgs);
  }

  if (name === 'feishu_company_directory') {
    const validationError = validateExactKeys(args, ['page_size', 'page_token']);
    if (validationError) return toolError(validationError);
    const pageSize = args.page_size ?? 100;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
      return toolError('page_size must be an integer between 1 and 500.');
    }
    if (args.page_token !== undefined && (typeof args.page_token !== 'string' || !args.page_token || /[\r\n]/u.test(args.page_token))) {
      return toolError('page_token must be a non-empty single-line string.');
    }
    const helperArgs = ['--page-size', String(pageSize)];
    if (args.page_token !== undefined) helperArgs.push('--page-token', args.page_token);
    return runHelper('fetch-feishu-company-directory', helperArgs);
  }

  if (name === 'feishu_send_direct_message') {
    const validationError = validateExactKeys(args, ['recipient_name', 'text', 'confirmation']);
    if (validationError) return toolError(validationError);
    if (typeof args.recipient_name !== 'string' || !args.recipient_name.trim() || /[\r\n]/u.test(args.recipient_name) || args.recipient_name.length > 255) {
      return toolError('recipient_name must be a non-empty single-line name up to 255 characters.');
    }
    if (typeof args.text !== 'string' || !args.text || args.text.length > 2000) {
      return toolError('text must contain between 1 and 2000 characters.');
    }
    if (args.confirmation !== 'send_direct_message') {
      return toolError('confirmation must equal send_direct_message after Craig explicitly approves this exact recipient and text.');
    }
    return runHelper('send-feishu-direct-message', [
      '--recipient-name', args.recipient_name.trim(),
      '--text', args.text,
      '--confirmation', args.confirmation,
    ]);
  }

  if (name === 'feishu_send_user_direct_message') {
    const validationError = validateExactKeys(args, ['recipient_name', 'text', 'confirmation']);
    if (validationError) return toolError(validationError);
    if (typeof args.recipient_name !== 'string' || !args.recipient_name.trim() || /[\r\n]/u.test(args.recipient_name) || args.recipient_name.length > 255) {
      return toolError('recipient_name must be a non-empty single-line name up to 255 characters.');
    }
    if (typeof args.text !== 'string' || !args.text || args.text.length > 2000) {
      return toolError('text must contain between 1 and 2000 characters.');
    }
    if (args.confirmation !== 'send_user_direct_message') {
      return toolError('confirmation must equal send_user_direct_message after Craig explicitly approves this exact recipient and text.');
    }
    return runHelper('send-feishu-user-direct-message', [
      '--recipient-name', args.recipient_name.trim(),
      '--text', args.text,
      '--confirmation', args.confirmation,
    ]);
  }

  return toolError(`Unknown local Feishu tool: ${name}`);
}

async function handle(message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return;
  const {id, method, params = {}} = message;
  if (method === 'notifications/initialized') return;
  if (method === 'initialize') {
    if (id !== undefined) result(id, {
      protocolVersion: '2024-11-05',
      capabilities: {tools: {}},
      serverInfo: {name: 'feishu-local', version: '0.1.0'},
    });
    return;
  }
  if (method === 'ping') {
    if (id !== undefined) result(id, {});
    return;
  }
  if (method === 'tools/list') {
    if (id !== undefined) result(id, {tools});
    return;
  }
  if (method === 'tools/call') {
    if (id !== undefined) result(id, await callTool(params.name, params.arguments ?? {}));
    return;
  }
  if (id !== undefined) error(id, -32601, `Method not found: ${method}`);
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    try {
      handle(JSON.parse(line)).catch(() => {});
    } catch {
      error(null, -32700, 'Parse error');
    }
  }
});
