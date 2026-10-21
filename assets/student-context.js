export function isSafeKey(value) {
 return typeof value === 'string' && value.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}
export function progressKey(profile, classKey, lessonId) {
 if (!isSafeKey(profile) || !isSafeKey(classKey) || typeof lessonId !== 'string' || !lessonId) throw new Error('Invalid student context');
 return ['student-player', profile, classKey, encodeURIComponent(lessonId)].join(':');
}
