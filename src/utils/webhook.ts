import type { PrismaClient } from "@prisma/client";
import { createUniqueId } from "./unique-id";

export interface WebhookEvent {
	event: string;
	data: any;
	timestamp: string;
	apiKeyId?: string;
}

export interface WebhookConfig {
	url: string;
	events: string[];
	secret?: string;
	retryCount?: number;
}

export class WebhookManager {
	constructor(private db: PrismaClient) {}

	async createWebhook(
		apiKeyId: string,
		config: WebhookConfig,
	): Promise<{
		id: string;
		url: string;
		events: string[];
		secret: string;
	}> {
		const secret = config.secret || `wh_${createUniqueId()}`;

		const webhook = await this.db.webhook.create({
			data: {
				url: config.url,
				events: config.events,
				secret,
				apiKeyId,
				retryCount: config.retryCount || 3,
			},
		});

		return {
			id: webhook.id,
			url: webhook.url,
			events: webhook.events as string[],
			secret: webhook.secret!,
		};
	}

	async listWebhooks(apiKeyId: string): Promise<
		Array<{
			id: string;
			url: string;
			events: string[];
			isActive: boolean;
			createdAt: Date;
		}>
	> {
		const webhooks = await this.db.webhook.findMany({
			where: { apiKeyId },
			select: {
				id: true,
				url: true,
				events: true,
				isActive: true,
				createdAt: true,
			},
			orderBy: { createdAt: "desc" },
		});

		return webhooks.map((webhook) => ({
			...webhook,
			events: webhook.events as string[],
		}));
	}

	async deleteWebhook(apiKeyId: string, webhookId: string): Promise<boolean> {
		try {
			await this.db.webhook.delete({
				where: {
					id: webhookId,
					apiKeyId,
				},
			});
			return true;
		} catch (error) {
			console.error("Failed to delete webhook:", error);
			return false;
		}
	}

	async triggerWebhook(event: WebhookEvent): Promise<void> {
		try {
			const webhooks = await this.db.webhook.findMany({
				where: {
					isActive: true,
					...(event.apiKeyId ? { apiKeyId: event.apiKeyId } : {}),
				},
			});

			// Filter webhooks that have the event
			const filteredWebhooks = webhooks.filter((webhook) => {
				const events = webhook.events as string[];
				return events && events.includes(event.event);
			});

			for (const webhook of filteredWebhooks) {
				await this.sendWebhook(webhook, event);
			}
		} catch (error) {
			console.error("Failed to trigger webhooks:", error);
		}
	}

	private async sendWebhook(webhook: any, event: WebhookEvent): Promise<void> {
		const payload = {
			id: createUniqueId(),
			event: event.event,
			data: event.data,
			timestamp: event.timestamp,
		};

		const signature = await this.generateSignature(JSON.stringify(payload), webhook.secret);

		let attempts = 0;
		let successful = false;
		let lastError: string | null = null;

		while (attempts < webhook.retryCount && !successful) {
			attempts++;

			try {
				const response = await fetch(webhook.url, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Shenasa-Signature": signature,
						"X-Shenasa-Event": event.event,
						"User-Agent": "Shenasa-Webhook/1.0",
					},
					body: JSON.stringify(payload),
				});

				if (response.ok) {
					successful = true;
				} else {
					lastError = `HTTP ${response.status}: ${response.statusText}`;
				}

				// Log the attempt
				await this.db.webhookLog.create({
					data: {
						webhookId: webhook.id,
						event: event.event,
						payload: JSON.stringify(payload),
						statusCode: response.status,
						attempts,
						successful,
						errorMessage: lastError,
					},
				});

				if (successful) break;

				// Exponential backoff for retries
				if (attempts < webhook.retryCount) {
					await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempts) * 1000));
				}
			} catch (error) {
				lastError = error instanceof Error ? error.message : "Unknown error";

				await this.db.webhookLog.create({
					data: {
						webhookId: webhook.id,
						event: event.event,
						payload: JSON.stringify(payload),
						attempts,
						successful: false,
						errorMessage: lastError,
					},
				});
			}
		}

		// Disable webhook after too many failures
		if (!successful && attempts >= webhook.retryCount) {
			const recentFailures = await this.db.webhookLog.count({
				where: {
					webhookId: webhook.id,
					successful: false,
					createdAt: {
						gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
					},
				},
			});

			if (recentFailures >= 10) {
				await this.db.webhook.update({
					where: { id: webhook.id },
					data: { isActive: false },
				});
			}
		}
	}

	private async generateSignature(payload: string, secret: string): Promise<string> {
		const encoder = new TextEncoder();
		const data = encoder.encode(payload);
		const key = encoder.encode(secret);

		const cryptoKey = await crypto.subtle.importKey(
			"raw",
			key,
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		);

		const signature = await crypto.subtle.sign("HMAC", cryptoKey, data);
		const hashArray = Array.from(new Uint8Array(signature));
		const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

		return `sha256=${hashHex}`;
	}

	async getWebhookLogs(
		webhookId: string,
		limit = 50,
	): Promise<
		Array<{
			id: string;
			event: string;
			statusCode: number | null;
			successful: boolean;
			attempts: number;
			errorMessage: string | null;
			createdAt: Date;
		}>
	> {
		return await this.db.webhookLog.findMany({
			where: { webhookId },
			select: {
				id: true,
				event: true,
				statusCode: true,
				successful: true,
				attempts: true,
				errorMessage: true,
				createdAt: true,
			},
			orderBy: { createdAt: "desc" },
			take: limit,
		});
	}
}

// Webhook event types
export const WEBHOOK_EVENTS = {
	NAME_LOOKUP: "name.lookup",
	BATCH_PROCESSED: "batch.processed",
	API_KEY_CREATED: "api_key.created",
	RATE_LIMIT_EXCEEDED: "rate_limit.exceeded",
	CACHE_WARMED: "cache.warmed",
	ALERT_TRIGGERED: "alert.triggered",
	EXPORT_COMPLETED: "export.completed",
} as const;

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[keyof typeof WEBHOOK_EVENTS];
