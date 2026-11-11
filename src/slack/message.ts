/** Minimal builders for Slack messages with (legacy) attachments. */

export type ResponseType = 'ephemeral' | 'in_channel';

export interface AttachmentField {
  title: string;
  value: string;
  short: boolean;
}

export interface Attachment {
  text: string;
  title?: string;
  color?: string;
  pretext?: string;
  footer?: string;
  fields?: AttachmentField[];
  mrkdwn_in: string[];
}

export interface SlackMessage {
  response_type: ResponseType;
  text?: string;
  attachments: Attachment[];
}

export function message(text?: string, responseType: ResponseType = 'ephemeral'): SlackMessage {
  return { response_type: responseType, ...(text !== undefined && { text }), attachments: [] };
}

export interface AttachmentOptions {
  color?: string;
  footer?: string;
  markdownIn?: string[];
  fields?: AttachmentField[];
}

export function attachment(text: string, title?: string, options: AttachmentOptions = {}): Attachment {
  const { color, footer, markdownIn = [], fields } = options;
  return {
    text,
    ...(title !== undefined && { title }),
    ...(color !== undefined && { color }),
    ...(footer !== undefined && { footer }),
    ...(fields !== undefined && { fields }),
    mrkdwn_in: [...new Set(['text', ...markdownIn])],
  };
}
