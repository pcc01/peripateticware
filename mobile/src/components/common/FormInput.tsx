import React from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInputProps,
} from 'react-native';

interface FormInputProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
  showPassword?: boolean;
  onTogglePassword?: () => void;
  icon?: string;
  touched?: boolean;
}

export const FormInput = React.forwardRef<TextInput, FormInputProps>(
  (
    {
      label,
      error,
      helperText,
      showPassword,
      onTogglePassword,
      icon,
      touched,
      secureTextEntry,
      ...props
    },
    ref
  ) => {
    const hasError = touched && error;

    return (
      <View style={styles.container}>
        {label && <Text style={styles.label}>{label}</Text>}

        <View
          style={[
            styles.inputWrapper,
            hasError && styles.inputWrapperError,
          ]}
        >
          {icon && <Text style={styles.icon}>{icon}</Text>}

          <TextInput
            ref={ref}
            style={[styles.input, secureTextEntry && !showPassword && styles.secureInput]}
            placeholderTextColor="#9ca3af"
            secureTextEntry={secureTextEntry && !showPassword}
            {...props}
          />

          {secureTextEntry && onTogglePassword && (
            <TouchableOpacity
              onPress={onTogglePassword}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.toggleIcon}>
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {error && touched && (
          <Text style={styles.error}>{error}</Text>
        )}

        {helperText && !error && (
          <Text style={styles.helperText}>{helperText}</Text>
        )}
      </View>
    );
  }
);

FormInput.displayName = 'FormInput';

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    paddingHorizontal: 12,
    height: 48,
  },
  inputWrapperError: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  icon: {
    fontSize: 18,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    paddingVertical: 12,
  },
  secureInput: {
    letterSpacing: 2,
  },
  toggleIcon: {
    fontSize: 18,
    marginLeft: 8,
  },
  error: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 4,
    fontWeight: '500',
  },
  helperText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
});
