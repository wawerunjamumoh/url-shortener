// Injection token for the single Redis client shared by the application.
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

// Sorted-set key: each short code is a member and its score is the access count.
export const URL_POPULARITY_KEY = 'urls:popularity';
