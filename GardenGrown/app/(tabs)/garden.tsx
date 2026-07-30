import { View, Text, StyleSheet } from 'react-native';

export default function Garden() {
  return (
    <View style={styles.container}>
      <Text>Welcome to the Garden!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});