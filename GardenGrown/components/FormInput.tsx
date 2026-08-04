// components/ProfileField.tsx
import React from 'react';
import { View, Text, TextInput, TextInputProps } from 'react-native';

interface ProfileFieldProps extends TextInputProps {
  label: string;
  isPassword?: boolean;
}

export default function ProfileField({ 
  label, 
  value, 
  onChangeText, 
  isPassword = false, 
  ...props 
}: ProfileFieldProps) {
  return (
    <View className="w-full mb-6">
      {/* Label stays dark to contrast with the page's sand background */}
      <Text className="font-zenmaru text-lg text-[#4A4A4A] mb-1 ml-1">
        {label}
      </Text>
      
      {/* Container for the tactile block shadow */}
      <View className="relative w-full">
        {/* 1. Solid Shadow Layer */}
        <View className="absolute w-full h-full bg-[#4A4A4A] rounded-xl top-1 left-1" />
        
        {/* 2. Main Input Layer (Slate Blue BG, Soft Green Text) */}
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