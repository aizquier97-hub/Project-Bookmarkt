import { supabase } from '@/lib/supabase';

/**
 * Permanently deletes the signed-in reader's account through the
 * `delete-account` Edge Function (server-side, service-role). The client
 * only asks; the server verifies the JWT and does the work.
 */
export async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });
  if (error) {
    let message = 'Your account could not be deleted. Please try again.';
    const context = (error as { context?: unknown }).context;
    if (context && typeof (context as Response).json === 'function') {
      try {
        const payload = (await (context as Response).json()) as { error?: string };
        if (payload?.error) {
          message = payload.error;
        }
      } catch {
        // Unparseable body: keep the generic message.
      }
    }
    throw new Error(message);
  }
  if (!(data as { deleted?: boolean })?.deleted) {
    throw new Error('Your account could not be deleted. Please try again.');
  }
}
