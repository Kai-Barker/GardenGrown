import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type CreateGardenModalProps = {
  visible: boolean;
  /**
   * First-garden mode: the user has no gardens, so the modal can't be
   * dismissed into a screen that doesn't work. Cancel becomes an explicit
   * route back to the dashboard.
   */
  mandatory?: boolean;
  /** Creation in flight — disables both buttons so it can't be double-fired. */
  busy?: boolean;
  onCancel: () => void;
  onCreate: (name: string) => void;
  onBackToDashboard?: () => void;
};

/**
 * Prompts for a new garden's name.
 *
 * This replaces Alert.prompt, which is iOS-only — on Android it silently does
 * nothing, so garden creation was impossible there. One component now serves
 * both platforms and both entry points (first-garden and the normal
 * "Create New Garden" action).
 */
export default function CreateGardenModal({
  visible,
  mandatory = false,
  busy = false,
  onCancel,
  onCreate,
  onBackToDashboard,
}: CreateGardenModalProps) {
  const [name, setName] = useState('');

  // Reset between openings, so a cancelled attempt doesn't prefill the next.
  useEffect(() => {
    if (visible) setName('');
  }, [visible]);

  const trimmed = name.trim();
  const canCreate = trimmed.length > 0 && !busy;

  const submit = () => {
    if (!canCreate) return;
    onCreate(trimmed);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Android's hardware back button. In mandatory mode it must not dismiss,
      // or the user lands on a garden screen that can't save anything.
      onRequestClose={mandatory ? () => {} : onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <Pressable
          className="flex-1 bg-black/40 justify-center items-center px-6"
          onPress={mandatory ? undefined : onCancel}
        >
          <Pressable
            className="relative w-full max-w-[420px]"
            onPress={(e) => e.stopPropagation()}
          >
            {/* Offset block shadow, matching the garden select modal. */}
            <View className="absolute w-full h-full bg-[#4A4A4A] rounded-2xl top-1 left-1" />

            <View className="relative bg-[#545E75] border-2 border-[#4A4A4A] rounded-2xl p-5">
              <Text className="font-zenmaru-bold text-xl text-[#FADBB3] mb-1">
                {mandatory ? 'Create your first garden' : 'New Garden'}
              </Text>
              <Text className="font-zenmaru text-sm text-[#FADBB3]/70 mb-4">
                {mandatory
                  ? 'You need a garden before you can start planting.'
                  : 'Give your new garden a name.'}
              </Text>

              <View className="relative w-full mb-5">
                <View className="absolute w-full h-full bg-[#4A4A4A] rounded-xl top-1 left-1" />
                <TextInput
                  className="relative w-full bg-[#46546B] border-2 border-[#4A4A4A] rounded-xl px-4 py-3 text-[#A3C4A3] font-zenmaru text-base"
                  value={name}
                  onChangeText={setName}
                  placeholder="My Garden"
                  placeholderTextColor="#A3C4A380"
                  autoFocus
                  autoCapitalize="words"
                  autoCorrect={false}
                  maxLength={40}
                  returnKeyType="done"
                  onSubmitEditing={submit}
                  editable={!busy}
                />
              </View>

              <View className="flex-row gap-x-3">
                <Pressable
                  onPress={mandatory ? onBackToDashboard : onCancel}
                  disabled={busy}
                  className={`flex-1 flex-row items-center justify-center gap-x-1 p-3 rounded-xl border-2 border-[#FADBB3]/30 active:opacity-70 ${
                    busy ? 'opacity-40' : ''
                  }`}
                >
                  {mandatory && (
                    <MaterialCommunityIcons name="chevron-left" size={18} color="#FADBB3" />
                  )}
                  <Text className="font-zenmaru text-base text-[#FADBB3]">
                    {mandatory ? 'Dashboard' : 'Cancel'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={submit}
                  disabled={!canCreate}
                  className={`flex-1 relative ${canCreate ? 'active:opacity-80' : 'opacity-40'}`}
                >
                  <View className="absolute w-full h-full bg-[#4A4A4A] rounded-xl top-1 left-1" />
                  <View className="relative flex-row items-center justify-center gap-x-2 p-3 rounded-xl bg-[#9BB49E] border-2 border-[#4A4A4A]">
                    {busy ? (
                      <ActivityIndicator size="small" color="#4A4A4A" />
                    ) : (
                      <>
                        <MaterialCommunityIcons name="plus" size={18} color="#4A4A4A" />
                        <Text className="font-zenmaru-bold text-base text-[#4A4A4A]">Create</Text>
                      </>
                    )}
                  </View>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
