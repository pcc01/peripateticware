// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useChildrenStore } from '../stores/childrenStore';
import { useActivityStore } from '../stores/activityStore';
import { Child, ChildProgress } from '../types';

export default function ChildProgressScreen({ route, navigation }: any) {
  const childId = route.params?.childId;
  const { children, selectedChild, selectChild, fetchChildProgress } = useChildrenStore();
  const { fetchActivities } = useActivityStore();
  const [progress, setProgress] = useState<ChildProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const child = childId
      ? children.find((c) => c.id === childId)
      : selectedChild;

    if (child) {
      loadProgress(child);
    }
  }, [childId, children, selectedChild]);

  const loadProgress = async (child: Child) => {
    try {
      setLoading(true);
      const childProgress = await fetchChildProgress(child.id);
      setProgress(childProgress);
      await fetchActivities(child.id);
    } catch (error) {
      console.error('Failed to load progress:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    const child = childId
      ? children.find((c) => c.id === childId)
      : selectedChild;

    if (child) {
      setRefreshing(true);
      await loadProgress(child);
      setRefreshing(false);
    }
  };

  const child = childId
    ? children.find((c) => c.id === childId)
    : selectedChild;

  if (!child) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No child selected</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!progress) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No progress data available</Text>
      </View>
    );
  }

  const percentage = Math.round(progress.percentComplete);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Child Header */}
      <View style={styles.header}>
        <View style={styles.childInfo}>
          <Text style={styles.childName}>{child.name}</Text>
          <Text style={styles.childGrade}>Grade {child.grade}</Text>
        </View>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{child.status}</Text>
        </View>
      </View>

      {/* Overall Progress */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Overall Progress</Text>
        <View style={styles.progressContainer}>
          <View style={styles.progressCircle}>
            <Text style={styles.progressPercentage}>{percentage}%</Text>
          </View>
          <View style={styles.progressStats}>
            <Text style={styles.statLabel}>Activities Completed</Text>
            <Text style={styles.statValue}>
              {progress.completedActivities} of {progress.totalActivities}
            </Text>
          </View>
        </View>

        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${percentage}%` },
            ]}
          />
        </View>
      </View>

      {/* Learning Areas */}
      {progress.learningAreas.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Learning Areas</Text>
          {progress.learningAreas.map((area, idx) => (
            <View key={idx} style={styles.learningArea}>
              <View style={styles.areaHeader}>
                <Text style={styles.areaName}>{area.name}</Text>
                <Text style={styles.areaProgress}>{Math.round(area.progress)}%</Text>
              </View>
              <View style={styles.areaProgressBar}>
                <View
                  style={[
                    styles.areaProgressFill,
                    { width: `${area.progress}%` },
                  ]}
                />
              </View>
              <Text style={styles.areaCount}>{area.count} activities</Text>
            </View>
          ))}
        </View>
      )}

      {/* Recent Activity */}
      {progress.lastActivityDate && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent Activity</Text>
          <Text style={styles.activityDate}>
            Last activity: {new Date(progress.lastActivityDate).toLocaleDateString()}
          </Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Activities', { childId: child.id })}
        >
          <Text style={styles.actionButtonText}>View Activities</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.actionButtonSecondary]}
          onPress={() => navigation.navigate('Settings')}
        >
          <Text style={styles.actionButtonTextSecondary}>View Reports</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: '#2563eb',
    padding: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  childInfo: {
    flex: 1,
  },
  childName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  childGrade: {
    fontSize: 14,
    color: '#e0e7ff',
    marginTop: 4,
  },
  statusBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  card: {
    margin: 16,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 20,
  },
  progressPercentage: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  progressStats: {
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2563eb',
  },
  learningArea: {
    marginBottom: 16,
  },
  areaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  areaName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  areaProgress: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  areaProgressBar: {
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    marginBottom: 4,
    overflow: 'hidden',
  },
  areaProgressFill: {
    height: '100%',
    backgroundColor: '#10b981',
  },
  areaCount: {
    fontSize: 12,
    color: '#9ca3af',
  },
  activityDate: {
    fontSize: 14,
    color: '#6b7280',
  },
  actionsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  actionButtonSecondary: {
    backgroundColor: '#e5e7eb',
  },
  actionButtonTextSecondary: {
    color: '#111827',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
  },
});
