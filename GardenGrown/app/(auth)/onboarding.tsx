import { useRouter } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';

export default function Onboarding() {
    const router = useRouter();

    const handleMoveToLogin = () => {
        router.replace('/(auth)/login');
    };

    return (
        <View style={styles.container}>
            <Text>Welcome to the Onboarding!</Text>
            <Pressable style={styles.button} onPress={handleMoveToLogin}>
                <Text style={styles.buttonText}>Log In</Text>
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