import { secureHeaders } from "hono/secure-headers";

export const secureHeadersConfig: Parameters<typeof secureHeaders>[0] = {
	// 1) CSP: A minimal baseline. Update or refine as needed.
	//    If we want to serve inline scripts/styles, consider using nonces/hashes instead of 'unsafe-inline'.
	contentSecurityPolicy: {
		defaultSrc: ["'self'"],
		// scriptSrc: ["'self'"],
		scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "https:"], // should be removed in production
		// styleSrc: ["'self'"], // Example: only allow styles from the same origin
		styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"], // should be removed in production
		objectSrc: ["'none'"], // Example: block object/embed tags
		imgSrc: ["'self'", "data:"], // Example: allow images from the same origin, inline data URIs
		fontSrc: ["'self'", "data:"], // Example: allow fonts from the same origin, inline data URIs
		upgradeInsecureRequests: [], // auto-upgrade http -> https resources
	},

	// 2) Cross-Origin Embedder Policy:
	//    Helps isolate the app’s context, required for some advanced APIs (e.g., WebAssembly threads).
	crossOriginEmbedderPolicy: "require-corp",

	// 3) Cross-Origin Opener Policy:
	//    Isolate browsing context; helps mitigate side-channel attacks like Spectre.
	crossOriginOpenerPolicy: "same-origin",

	// 4) Cross-Origin Resource Policy:
	//    Decide how the site can load cross-origin resources.
	crossOriginResourcePolicy: "same-origin",

	// 5) originAgentCluster:
	//    Indicates a preference to use a separate agent cluster for this origin (newer security feature).
	originAgentCluster: true,

	// 6) Referrer-Policy:
	//    Typically "no-referrer" or "strict-origin-when-cross-origin".
	referrerPolicy: "no-referrer",

	// 7) Strict Transport Security (a.k.a. HSTS):
	//    Force the client to use HTTPS for this domain and subdomains for 1 year.
	strictTransportSecurity: "max-age=31536000; includeSubDomains; preload",

	// 8) X-Content-Type-Options (or noSniff):
	//    Prevent MIME-type sniffing.
	xContentTypeOptions: true,

	// 9) X-DNS-Prefetch-Control (or dnsPrefetchControl):
	//    Disable DNS prefetching.
	xDnsPrefetchControl: false,

	// 10) X-Download-Options (or ieNoOpen):
	//     Mitigates some IE file download execution vulnerabilities.
	xDownloadOptions: true,

	// 11) X-Frame-Options (or frameguard):
	//     Deny rendering in frames to prevent clickjacking.
	xFrameOptions: "deny",

	// 12) X-Permitted-Cross-Domain-Policies (or permittedCrossDomainPolicies):
	//     Typically "none" unless we need Adobe Flash/Acrobat cross-domain requests.
	xPermittedCrossDomainPolicies: "none",

	// 14) X-XSS-Protection (or xssFilter):
	//     Legacy header for basic XSS filter in IE/older browsers. Often ignored by modern browsers.
	xXssProtection: true,

	// 15) Hide X-Powered-By header:
	//     Helps prevent information exposure.
	removePoweredBy: true,
};
