import { useRouter } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';

export default function Signup() {
    const router = useRouter();

    const handleMoveToLogin = () => {
        router.replace('/(auth)/login');
    };
    const handleFakeLogin = () => {
        router.replace('/(tabs)/dashboard');
    };
    return (
        <View style={styles.container}>
            <Text>Welcome to the Signup!</Text>
            <Pressable style={styles.button} onPress={handleFakeLogin}>
                <Text style={styles.buttonText}>Log In</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={handleMoveToLogin}>
                <Text style={styles.buttonText}>Already have an account?</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    title: { fontSize: 24, marginBottom: 20 },
    button: { backgroundColor: 'green', padding: 15, borderRadius: 8 },
    buttonText: { color: 'white', fontWeight: 'bold' },
});