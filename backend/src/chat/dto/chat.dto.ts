// 请求
export class ChatRequestDto {
  messages!: { role: 'user' | 'assistant'; content: string }[];
}

// 响应
export class ChatResponseDto {
  role!: 'assistant';
  content!: string;
}
