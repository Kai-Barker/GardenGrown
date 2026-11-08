import React from 'react';
import { View, Text, TextInput, TextInputProps } from 'react-native';

interface ProfileFieldProps extends TextInputProps {
  label: string;
  isPassword?: boolean;
}

/**
 * A labelled text field in the app's block-shadow style, used on the profile
 * screen. Set `isPassword` to mask the input; any other TextInput props are
 * passed straight through.
 */
export default function FormInput({
  label,
  value,
  onChangeText,
  isPassword = false,
  ...props
}: ProfileFieldProps) {
  return (
    <View className="w-full mb-6">
      <Text className="font-zenmaru text-lg text-[#4A4A4A] mb-1 ml-1">
        {label}
      </Text>

      <View className="relative w-full">
        <View className="absolute w-full h-full bg-[#4A4A4A] rounded-xl top-1 left-1" />

        <TextInput
          className="relative w-full bg-[#545E75] border-2 border-[#4A4A4A] rounded-xl px-4 py-3 text-[#A3C4A3] font-zenmaru text-base"
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={isPassword}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor="#A3C4A380" // Soft green with 50% opacity
          {...props}
        />
      </View>
    </View>
  );
}