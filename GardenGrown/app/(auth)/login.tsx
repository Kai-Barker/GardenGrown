import { useRouter } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';

export default function Login() {
    const router = useRouter();

    const handleMoveToSignup = () => {
        router.replace('/(auth)/signup');
    };
    const handleFakeLogin = () => {
        router.replace('/(tabs)/dashboard');
    };

    return (
        <View style={styles.container}>
            <Text>Welcome to the Login!</Text>
            <Pressable style={styles.button} onPress={handleFakeLogin}>
                <Text style={styles.buttonText}>Log In</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={handleMoveToSignup}>
                <Text style={styles.buttonText}>Sign Up</Text>
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