import { Stack } from 'expo-router';
import { AuthProvider } from '../context/AuthContext';
export default function RootLayout() {
  return (
    <AuthProvider>
 <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0A0A0F' },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: '#0A0A0F' },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="dashboard" options={{ headerShown: false }} />
      <Stack.Screen name="subject/[id]" options={{ title: 'Subject' }} />
      <Stack.Screen name="camera/[id]" options={{ title: 'Mark Attendance' }} />
      <Stack.Screen name="upload/[id]" options={{ title: 'Upload Student Photos' }} />
      <Stack.Screen name="add-course" options={{ title: 'Add Course' }} />
    </Stack>
    </AuthProvider>
   
  );
}