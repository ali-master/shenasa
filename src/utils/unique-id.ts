import { createId } from "@orama/cuid2";

/**
 * Generate a unique id for Collision-resistant ids optimized for horizontal scaling and binary search lookup performance.
 */
export function createUniqueId() {
	return createId();
}
