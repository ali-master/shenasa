/**
 * Centralized logging utility for the Shenasa API
 * Provides structured logging with tracing capabilities and multiple log levels
 * Features beautiful console output with colors for development
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogContext {
	requestId?: string;
	userId?: string;
	apiKey?: string;
	ipAddress?: string;
	userAgent?: string;
	endpoint?: string;
	method?: string;
	statusCode?: number;
	responseTime?: number;
	traceId?: string;
	spanId?: string;
	headers?: Record<string, string>;
	[key: string]: unknown;
}

export interface LogData {
	message: string;
	level: LogLevel;
	timestamp: string;
	service?: string;
	version?: string;
	environment?: string;
	context?: LogContext;
	error?: Error | string;
	data?: Record<string, unknown>;
	stack?: string;
}

// ANSI color codes for beautiful console output
const colors = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	dim: "\x1b[2m",
	underscore: "\x1b[4m",
	blink: "\x1b[5m",
	reverse: "\x1b[7m",
	hidden: "\x1b[8m",

	// Foreground colors
	black: "\x1b[30m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
	white: "\x1b[37m",

	// Background colors
	bgBlack: "\x1b[40m",
	bgRed: "\x1b[41m",
	bgGreen: "\x1b[42m",
	bgYellow: "\x1b[43m",
	bgBlue: "\x1b[44m",
	bgMagenta: "\x1b[45m",
	bgCyan: "\x1b[46m",
	bgWhite: "\x1b[47m",

	// Bright colors
	brightBlack: "\x1b[90m",
	brightRed: "\x1b[91m",
	brightGreen: "\x1b[92m",
	brightYellow: "\x1b[93m",
	brightBlue: "\x1b[94m",
	brightMagenta: "\x1b[95m",
	brightCyan: "\x1b[96m",
	brightWhite: "\x1b[97m",
};

// Log level configurations with colors and icons
const logLevelConfig = {
	debug: {
		color: colors.brightBlack,
		icon: "🔍",
		label: "DEBUG",
		consoleMethod: "debug" as const,
	},
	info: {
		color: colors.brightBlue,
		icon: "ℹ️",
		label: "INFO",
		consoleMethod: "info" as const,
	},
	warn: {
		color: colors.brightYellow,
		icon: "⚠️",
		label: "WARN",
		consoleMethod: "warn" as const,
	},
	error: {
		color: colors.brightRed,
		icon: "❌",
		label: "ERROR",
		consoleMethod: "error" as const,
	},
	fatal: {
		color: colors.red + colors.bright,
		icon: "💀",
		label: "FATAL",
		consoleMethod: "error" as const,
	},
};

class Logger {
	private serviceName: string;
	private version: string;
	private environment: string;

	constructor(serviceName = "shenasa-api", version = "2.0.0", environment = "development") {
		this.serviceName = serviceName;
		this.version = version;
		this.environment = environment;
	}

	/**
	 * Format log entry with structured data
	 */
	private formatLog(
		level: LogLevel,
		message: string,
		context?: LogContext,
		error?: Error | string,
		data?: Record<string, unknown>,
	): LogData {
		const timestamp = new Date().toISOString();

		const logEntry: LogData = {
			message,
			level,
			timestamp,
			service: this.serviceName,
			version: this.version,
			environment: this.environment,
		};

		if (context) {
			logEntry.context = context;
		}

		if (error) {
			if (error instanceof Error) {
				logEntry.error = error.message;
				logEntry.stack = error.stack;
			} else {
				logEntry.error = error;
			}
		}

		if (data) {
			logEntry.data = data;
		}

		return logEntry;
	}

	/**
	 * Output formatted log to console with beautiful formatting
	 */
	private output(logData: LogData): void {
		if (this.environment === "development") {
			this.outputPretty(logData);
		} else {
			this.outputJSON(logData);
		}
	}

	/**
	 * Output JSON format for production
	 */
	private outputJSON(logData: LogData): void {
		const logString = JSON.stringify(logData);
		const config = logLevelConfig[logData.level];
		console[config.consoleMethod](logString);
	}

	/**
	 * Output pretty format for development with colors and formatting
	 */
	private outputPretty(logData: LogData): void {
		const config = logLevelConfig[logData.level];
		const timestamp = new Date(logData.timestamp).toLocaleTimeString();

		// Build the main log line
		const logParts = [
			// Timestamp
			`${colors.dim}${timestamp}${colors.reset}`,
			// Level with icon and color
			`${config.color}${config.icon}  ${config.label}${colors.reset}`,
			// Service name
			`${colors.cyan}[${logData.service}]${colors.reset}`,
		];

		// Add request ID if available
		if (logData.context?.requestId) {
			logParts.push(`${colors.magenta}[${logData.context.requestId.slice(0, 8)}]${colors.reset}`);
		}

		// Add the main message
		logParts.push(`${colors.bright}${logData.message}${colors.reset}`);

		console[config.consoleMethod](logParts.join(" "));

		// Add context information if available
		if (logData.context) {
			this.outputContext(logData.context);
		}

		// Add error details if available
		if (logData.error) {
			this.outputError(String(logData.error), logData.stack);
		}

		// Add additional data if available
		if (logData.data && Object.keys(logData.data).length > 0) {
			this.outputData(logData.data);
		}

		// Add a subtle separator for readability
		if (logData.level === "error" || logData.level === "fatal") {
			console.log(`${colors.dim}${"─".repeat(80)}${colors.reset}`);
		}
	}

	/**
	 * Output context information in a readable format
	 */
	private outputContext(context: LogContext): void {
		const contextEntries = Object.entries(context)
			.filter(([key, value]) => value !== undefined && key !== "requestId")
			.map(([key, value]) => {
				const coloredKey = `${colors.brightBlack}${key}${colors.reset}`;
				let coloredValue: string;

				// Special formatting for different types of values
				switch (key) {
					case "method":
						coloredValue = this.formatHttpMethod(value as string);
						break;
					case "statusCode":
						coloredValue = this.formatStatusCode(value as number);
						break;
					case "responseTime":
						coloredValue = this.formatResponseTime(value as number);
						break;
					case "endpoint":
						coloredValue = `${colors.brightCyan}${value}${colors.reset}`;
						break;
					case "ipAddress":
						coloredValue = `${colors.brightGreen}${value}${colors.reset}`;
						break;
					default:
						coloredValue = `${colors.white}${value}${colors.reset}`;
				}

				return `${coloredKey}: ${coloredValue}`;
			});

		if (contextEntries.length > 0) {
			console.log(`  ${colors.dim}└─${colors.reset} ${contextEntries.join(" | ")}`);
		}
	}

	/**
	 * Output error information with stack trace
	 */
	private outputError(error: string, stack?: string): void {
		console.log(
			`  ${colors.red}✗ Error:${colors.reset} ${colors.brightRed}${error}${colors.reset}`,
		);
		if (stack) {
			const stackLines = stack.split("\n").slice(1, 4); // Show first 3 stack lines
			stackLines.forEach((line) => {
				console.log(`  ${colors.dim}  ${line.trim()}${colors.reset}`);
			});
		}
	}

	/**
	 * Output additional data
	 */
	private outputData(data: Record<string, unknown>): void {
		console.log(`  ${colors.brightBlack}📊 Data:${colors.reset}`);
		Object.entries(data).forEach(([key, value]) => {
			const formattedValue =
				typeof value === "object"
					? JSON.stringify(value, null, 2)
							.split("\n")
							.map((line) => `    ${line}`)
							.join("\n")
					: String(value);
			console.log(
				`    ${colors.cyan}${key}${colors.reset}: ${colors.white}${formattedValue}${colors.reset}`,
			);
		});
	}

	/**
	 * Format HTTP method with appropriate colors
	 */
	private formatHttpMethod(method: string): string {
		const methodColors = {
			GET: colors.brightGreen,
			POST: colors.brightBlue,
			PUT: colors.brightYellow,
			DELETE: colors.brightRed,
			PATCH: colors.brightMagenta,
			OPTIONS: colors.brightCyan,
		};
		const color = methodColors[method as keyof typeof methodColors] || colors.white;
		return `${color}${method}${colors.reset}`;
	}

	/**
	 * Format status code with appropriate colors
	 */
	private formatStatusCode(statusCode: number): string {
		let color: string;
		if (statusCode >= 200 && statusCode < 300) {
			color = colors.brightGreen;
		} else if (statusCode >= 300 && statusCode < 400) {
			color = colors.brightYellow;
		} else if (statusCode >= 400 && statusCode < 500) {
			color = colors.brightRed;
		} else if (statusCode >= 500) {
			color = colors.red + colors.bright;
		} else {
			color = colors.white;
		}
		return `${color}${statusCode}${colors.reset}`;
	}

	/**
	 * Format response time with appropriate colors
	 */
	private formatResponseTime(responseTime: number): string {
		let color: string;
		if (responseTime < 100) {
			color = colors.brightGreen;
		} else if (responseTime < 500) {
			color = colors.brightYellow;
		} else if (responseTime < 1000) {
			color = colors.yellow;
		} else {
			color = colors.brightRed;
		}
		return `${color}${responseTime}ms${colors.reset}`;
	}

	/**
	 * Debug level logging
	 */
	debug(message: string, context?: LogContext, data?: Record<string, unknown>): void {
		const logData = this.formatLog("debug", message, context, undefined, data);
		this.output(logData);
	}

	/**
	 * Info level logging
	 */
	info(message: string, context?: LogContext, data?: Record<string, unknown>): void {
		const logData = this.formatLog("info", message, context, undefined, data);
		this.output(logData);
	}

	/**
	 * Warning level logging
	 */
	warn(message: string, context?: LogContext, data?: Record<string, unknown>): void {
		const logData = this.formatLog("warn", message, context, undefined, data);
		this.output(logData);
	}

	/**
	 * Error level logging
	 */
	error(
		message: string,
		error?: Error | string,
		context?: LogContext,
		data?: Record<string, unknown>,
	): void {
		const logData = this.formatLog("error", message, context, error, data);
		this.output(logData);
	}

	/**
	 * Fatal level logging
	 */
	fatal(
		message: string,
		error?: Error | string,
		context?: LogContext,
		data?: Record<string, unknown>,
	): void {
		const logData = this.formatLog("fatal", message, context, error, data);
		this.output(logData);
	}

	/**
	 * Log API request
	 */
	logRequest(
		method: string,
		endpoint: string,
		context: LogContext,
		data?: Record<string, unknown>,
	): void {
		const requestIcon = "📥";
		this.info(
			`${requestIcon} ${method} ${endpoint}`,
			{
				...context,
				method,
				endpoint,
			},
			data,
		);
	}

	/**
	 * Log API response
	 */
	logResponse(
		method: string,
		endpoint: string,
		statusCode: number,
		responseTime: number,
		context: LogContext,
		data?: Record<string, unknown>,
	): void {
		const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";
		const responseIcon = statusCode >= 500 ? "💥" : statusCode >= 400 ? "⚠️" : "✅";
		const message = `${responseIcon} ${method} ${endpoint} - ${statusCode} (${responseTime}ms)`;

		const logData = this.formatLog(
			level,
			message,
			{
				...context,
				method,
				endpoint,
				statusCode,
				responseTime,
			},
			undefined,
			data,
		);

		this.output(logData);
	}

	/**
	 * Log database operation
	 */
	logDatabase(
		operation: string,
		table: string,
		duration: number,
		context?: LogContext,
		data?: Record<string, unknown>,
	): void {
		const dbIcon = duration < 50 ? "🚀" : duration < 200 ? "🐎" : "🐢";
		this.debug(`${dbIcon} Database ${operation} on ${table} (${duration}ms)`, context, {
			operation,
			table,
			duration,
			...data,
		});
	}

	/**
	 * Log cache operation
	 */
	logCache(
		operation: "hit" | "miss" | "set" | "delete" | "warm",
		key: string,
		context?: LogContext,
		data?: Record<string, unknown>,
	): void {
		const cacheIcons = {
			hit: "💚",
			miss: "💛",
			set: "💾",
			delete: "🗑️",
			warm: "🔥",
		};
		this.debug(`${cacheIcons[operation]} Cache ${operation}: ${key}`, context, {
			cacheOperation: operation,
			cacheKey: key,
			...data,
		});
	}

	/**
	 * Log security event
	 */
	logSecurity(
		event: string,
		severity: "low" | "medium" | "high" | "critical",
		context: LogContext,
		data?: Record<string, unknown>,
	): void {
		const level = severity === "critical" ? "fatal" : severity === "high" ? "error" : "warn";
		const securityIcon = severity === "critical" ? "🚨" : severity === "high" ? "🔒" : "🛡️";

		const logData = this.formatLog(
			level,
			`${securityIcon} Security event: ${event}`,
			context,
			undefined,
			{
				securityEvent: event,
				severity,
				...data,
			},
		);

		this.output(logData);
	}

	/**
	 * Log performance metric
	 */
	logPerformance(
		metric: string,
		value: number,
		unit: string,
		context?: LogContext,
		data?: Record<string, unknown>,
	): void {
		const performanceIcon = value < 100 ? "⚡" : value < 500 ? "🏃" : "🐌";
		this.info(`${performanceIcon} Performance: ${metric} = ${value}${unit}`, context, {
			performanceMetric: metric,
			value,
			unit,
			...data,
		});
	}

	/**
	 * Create child logger with additional context
	 */
	child(additionalContext: LogContext): ChildLogger {
		return new ChildLogger(this, additionalContext);
	}
}

/**
 * Child logger that inherits context from parent
 */
class ChildLogger {
	constructor(
		private parent: Logger,
		private baseContext: LogContext,
	) {}

	private mergeContext(context?: LogContext): LogContext {
		return { ...this.baseContext, ...context };
	}

	debug(message: string, context?: LogContext, data?: Record<string, unknown>): void {
		this.parent.debug(message, this.mergeContext(context), data);
	}

	info(message: string, context?: LogContext, data?: Record<string, unknown>): void {
		this.parent.info(message, this.mergeContext(context), data);
	}

	warn(message: string, context?: LogContext, data?: Record<string, unknown>): void {
		this.parent.warn(message, this.mergeContext(context), data);
	}

	error(
		message: string,
		error?: Error | string,
		context?: LogContext,
		data?: Record<string, unknown>,
	): void {
		this.parent.error(message, error, this.mergeContext(context), data);
	}

	fatal(
		message: string,
		error?: Error | string,
		context?: LogContext,
		data?: Record<string, unknown>,
	): void {
		this.parent.fatal(message, error, this.mergeContext(context), data);
	}

	logRequest(
		method: string,
		endpoint: string,
		context?: LogContext,
		data?: Record<string, unknown>,
	): void {
		this.parent.logRequest(method, endpoint, this.mergeContext(context), data);
	}

	logResponse(
		method: string,
		endpoint: string,
		statusCode: number,
		responseTime: number,
		context?: LogContext,
		data?: Record<string, unknown>,
	): void {
		this.parent.logResponse(
			method,
			endpoint,
			statusCode,
			responseTime,
			this.mergeContext(context),
			data,
		);
	}

	logDatabase(
		operation: string,
		table: string,
		duration: number,
		context?: LogContext,
		data?: Record<string, unknown>,
	): void {
		this.parent.logDatabase(operation, table, duration, this.mergeContext(context), data);
	}

	logCache(
		operation: "hit" | "miss" | "set" | "delete" | "warm",
		key: string,
		context?: LogContext,
		data?: Record<string, unknown>,
	): void {
		this.parent.logCache(operation, key, this.mergeContext(context), data);
	}

	logSecurity(
		event: string,
		severity: "low" | "medium" | "high" | "critical",
		context?: LogContext,
		data?: Record<string, unknown>,
	): void {
		this.parent.logSecurity(event, severity, this.mergeContext(context), data);
	}

	logPerformance(
		metric: string,
		value: number,
		unit: string,
		context?: LogContext,
		data?: Record<string, unknown>,
	): void {
		this.parent.logPerformance(metric, value, unit, this.mergeContext(context), data);
	}

	child(additionalContext: LogContext): ChildLogger {
		return new ChildLogger(this.parent, this.mergeContext(additionalContext));
	}
}

// Create and export singleton logger instance
export const logger = new Logger();

// Export Logger class for custom instances
export { Logger };

// Export logger middleware factory for Hono
export function createLoggerMiddleware() {
	return async (c: any, next: any) => {
		const requestId = c.get("requestId") || c.req.header("x-request-id") || "unknown";
		const startTime = Date.now();

		// Create request-scoped logger
		const requestLogger = logger.child({
			requestId,
			method: c.req.method,
			endpoint: c.req.path,
			ipAddress: c.req.header("cf-connecting-ip"),
			userAgent: c.req.header("user-agent"),
			apiKey: c.get("apiKey"),
		});

		// Log incoming request
		requestLogger.logRequest(c.req.method, c.req.path, {});

		// Add logger to context
		c.set("logger", requestLogger);

		try {
			await next();

			// Log successful response
			const responseTime = Date.now() - startTime;
			const statusCode = c.res.status || 200;

			requestLogger.logResponse(
				c.req.method,
				c.req.path,
				statusCode,
				responseTime,
				{},
				{
					responseSize: c.res.headers.get("content-length"),
				},
			);
		} catch (error) {
			// Log error response
			const responseTime = Date.now() - startTime;

			requestLogger.error(
				"Request failed with error",
				error as Error,
				{},
				{
					responseTime,
				},
			);

			throw error; // Re-throw to let error handling middleware process it
		}
	};
}
