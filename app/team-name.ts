/** Display name of a laboratory team. The stored stream value stays 'Chemical' so saved records keep working. */
export const teamName = (stream: string) => (stream === 'Chemical' ? 'Chemistry' : stream);
