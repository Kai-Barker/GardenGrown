import { View, Text, TextInput, Pressable, TextInputProps } from 'react-native';

type CustomButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
};

/**
 * A full-width button for the auth screens, drawn on a solid offset shadow.
 * `primary` is dark slate with sand text; `secondary` is a light earthy tone
 * with dark text.
 */
export function AuthButton({ title, onPress, variant = 'primary' }: CustomButtonProps) {
  const bgColor = variant === 'primary' ? 'bg-[#545E75]' : 'bg-[#EFEAE1]';
  const textColor = variant === 'primary' ? 'text-[#FADBB3]' : 'text-[#4A4A4A]';

  return (
    <Pressable className="relative w-full mb-4 active:opacity-80" onPress={onPress}>
      <View className="absolute w-full h-14 bg-[#4A4A4A] rounded-2xl top-1 left-1" />

      <View className={`relative ${bgColor} border-2 border-[#4A4A4A] rounded-2xl h-14 items-center justify-center`}>
        <Text className={`font-zenmaru-bold ${textColor} text-xl`}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

type CustomInputProps = TextInputProps & {
  label: string;
};

/** A labelled text field for the login and signup forms; extra props go to the TextInput. */
export function AuthInput({ label, ...props }: CustomInputProps) {
  return (
    <View className="w-full mb-4">
      <Text className="font-zenmaru-bold text-[#4A4A4A] text-lg mb-1">{label}</Text>
      <TextInput
        className="w-full bg-white/60 border-2 border-[#4A4A4A] rounded-xl px-4 py-3 font-zenmaru text-[#4A4A4A] text-base"
        placeholderTextColor="#4A4A4A80"
        {...props}
      />
    </View>
  );
}

/** A horizontal rule with a word in the middle, e.g. "or" between two auth options. */
export function AuthDivider({ text }: { text: string }) {
  return (
    <View className="flex-row items-center my-6">
      <View className="flex-1 h-0.5 bg-[#4A4A4A]" />
      <Text className="font-zenloop text-[#4A4A4A] text-2xl px-4">{text}</Text>
      <View className="flex-1 h-0.5 bg-[#4A4A4A]" />
    </View>
  );
}