/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Calculate the total character count of a payload by converting it to JSON string
 * @param payload - The payload object to count characters for
 * @returns Total character count of the stringified payload
 */
export function calculatePayloadCharacterCount(payload: any): number {
  try {
    const jsonString = JSON.stringify(payload);
    return jsonString.length;
  } catch (error) {
    console.error('Error stringifying payload for character count:', error);
    return 0;
  }
}