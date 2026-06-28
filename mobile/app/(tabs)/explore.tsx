// Redirects to Discover — this file kept to avoid broken imports
import { Redirect } from 'expo-router';
export default function ExploreRedirect() {
  return <Redirect href="/(tabs)" />;
}
