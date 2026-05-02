// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { InquiryEntry, LearningSession } from '@types/session'
import { InputType } from '@/config/constants'
import Card from '@components/common/Card'
import Input from '@components/common/Input'
import Button from '@components/common/Button'
import Badge from '@components/common/Badge'
import inferenceService from '@services/inferenceService'

interface InquiryInterfaceProps {
  session: LearningSession
  onInquirySubmitted?: (inquiry: InquiryEntry) => void
}

const InquiryInterface: React.FC<InquiryInterfaceProps> = ({ session, onInquirySubmitted }) => {
  const { t } = useTranslation(['student', 'common'])
  const [inputType, setInputType] = useState<InputType>(InputType.TEXT)
  const [textInput, setTextInput] = useState('')
  const [audioInput, setAudioInput] = useState<File | null>(null)
  const [imageInput, setImageInput] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [response, setResponse] = useState<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const recordingRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const handleSubmitInquiry = async () => {
    if (!textInput.trim()) {
      alert(t('student:inquiry.noInputError'))
      return
    }

    setIsLoading(true)
    try {
      const inquiryResponse = await inferenceService.processInquiry({
        session_id: session.session_id,
        input_type: InputType.TEXT,
        text: textInput,
        location: {
          latitude: session.location.latitude,
          longitude: session.location.longitude,
          location_name: session.location.name,
        },
        curriculum_context: {
          topic: 'Current Unit',
          bloom_level: 1,
        },
      })

      setResponse(inquiryResponse)
      setTextInput('')

      // Create inquiry entry
      const inquiry: InquiryEntry = {
        timestamp: new Date().toISOString(),
        question: textInput,
        input_type: InputType.TEXT,
        student_response: '',
        socratic_prompt: inquiryResponse.next_question,
        ai_response: JSON.stringify(inquiryResponse),
        confidence: inquiryResponse.confidence,
      }

      onInquirySubmitted?.(inquiry)
    } catch (error) {
      console.error('Failed to process inquiry:', error)
      alert('Failed to process your question')
    } finally {
      setIsLoading(false)
    }
  }

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recordingRef.current = new MediaRecorder(stream)
      chunksRef.current = []

      recordingRef.current.ondataavailable = (e) => {
        chunksRef.current.push(e.data)
      }

      recordingRef.current.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioInput(new File([audioBlob], 'recording.webm', { type: 'audio/webm' }))
      }

      recordingRef.current.start()
    } catch (error) {
      console.error('Failed to start recording:', error)
    }
  }

  const handleStopRecording = () => {
    if (recordingRef.current) {
      recordingRef.current.stop()
      recordingRef.current.stream.getTracks().forEach((track) => track.stop())
    }
  }

  return (
    <div className="space-y-6">
      {/* Input Method Selector */}
      <Card title={t('student:inquiry.title')}>
        <div className="flex gap-2 mb-4 flex-wrap">
          <Button
            variant={inputType === InputType.TEXT ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setInputType(InputType.TEXT)}
          >
            {t('common:search')}
          </Button>
          <Button
            variant={inputType === InputType.IMAGE ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setInputType(InputType.IMAGE)}
          >
            📷 {t('student:inquiry.takePhoto')}
          </Button>
          <Button
            variant={inputType === InputType.AUDIO ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setInputType(InputType.AUDIO)}
          >
            🎤 {t('student:inquiry.recordAudio')}
          </Button>
        </div>

        {/* Text Input */}
        {inputType === InputType.TEXT && (
          <div className="space-y-3">
            <Input
              label={t('student:inquiry.typeYourQuestion')}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              multiline
              rows={4}
              placeholder={t('student:inquiry.typeYourQuestion')}
            />
            <Button
              variant="primary"
              onClick={handleSubmitInquiry}
              isLoading={isLoading}
              disabled={!textInput.trim()}
            >
              {t('student:inquiry.askQuestion')}
            </Button>
          </div>
        )}

        {/* Audio Input */}
        {inputType === InputType.AUDIO && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={handleStartRecording}>
                {t('student:inquiry.recordAudio')}
              </Button>
              <Button variant="secondary" size="sm" onClick={handleStopRecording}>
                {t('common:stop')}
              </Button>
            </div>
            {audioInput && (
              <>
                <p className="text-sm text-color-text-secondary">Recording saved</p>
                <Button variant="primary" onClick={handleSubmitInquiry} isLoading={isLoading}>
                  {t('common:submit')}
                </Button>
              </>
            )}
          </div>
        )}

        {/* Image Input */}
        {inputType === InputType.IMAGE && (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => setImageInput(e.target.files?.[0] || null)}
              className="hidden"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              📷 {t('student:inquiry.takePhoto')}
            </Button>
            {imageInput && (
              <>
                <p className="text-sm text-color-text-secondary">{imageInput.name}</p>
                <Button variant="primary" onClick={handleSubmitInquiry} isLoading={isLoading}>
                  {t('common:submit')}
                </Button>
              </>
            )}
          </div>
        )}
      </Card>

      {/* Response Display */}
      {response && (
        <Card title={t('student:inquiry.prompt')}>
          <div className="space-y-4">
            <div className="bg-color-primary-light px-4 py-3 rounded-lg border-l-4 border-color-primary">
              <p className="font-medium text-color-primary mb-2">
                {t('student:inquiry.promptHint', { prompt: response.next_question })}
              </p>
            </div>

            {response.resources && response.resources.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">{t('student:inquiry.resources')}</h3>
                <ul className="space-y-2">
                  {response.resources.map((resource: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Badge variant="secondary" size="sm">
                        {idx + 1}
                      </Badge>
                      <p className="text-color-text-secondary">{resource}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-between items-center text-sm">
              <span className="text-color-text-secondary">
                {t('common:confidence')}: {(response.confidence * 100).toFixed(0)}%
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setResponse(null)
                  setTextInput('')
                }}
              >
                {t('student:inquiry.moreQuestions')}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

export default InquiryInterface
