type CompletionPhoto = { photo_type: string };

export function hasCompletionPhoto(photos: CompletionPhoto[]): boolean {
  return photos.some(photo => photo.photo_type === 'completion');
}
