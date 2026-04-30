import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  FlatList,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

interface Child {
  id: string;
  name: string;
  avatar: string;
  progress: number;
  activities_completed: number;
  hours_learned: number;
}

interface Activity {
  id: string;
  child_name: string;
  activity_name: string;
  completed_at: string;
  score: number;
}

export default function DashboardScreen({ navigation }: any) {
  const [children, setChildren] = useState<Child[]>([
    {
      id: 'child1',
      name: 'Emma',
      avatar: '👧',
      progress: 75,
      activities_completed: 12,
      hours_learned: 8.5,
    },
    {
      id: 'child2',
      name: 'Lucas',
      avatar: '👦',
      progress: 68,
      activities_completed: 10,
      hours_learned: 6.2,
    },
  ]);

  const [recentActivities, setRecentActivities] = useState<Activity[]>([
    {
      id: '1',
      child_name: 'Emma',
      activity_name: 'Photosynthesis Quiz',
      completed_at: '2 hours ago',
      score: 95,
    },
    {
      id: '2',
      child_name: 'Lucas',
      activity_name: 'Fractions Practice',
      completed_at: '4 hours ago',
      score: 88,
    },
    {
      id: '3',
      child_name: 'Emma',
      activity_name: 'Writing Exercise',
      completed_at: '1 day ago',
      score: 82,
    },
  ]);

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setRefreshing(false);
  };

  useFocusEffect(
    React.useCallback(() => {
      // Fetch data when screen is focused
      // In production: call API to get children and activities
    }, [])
  );

  const renderChildCard = ({ item }: { item: Child }) => (
    <TouchableOpacity
      style={styles.childCard}
      onPress={() => navigation.navigate('ChildProgress', { childId: item.id })}
    >
      <View style={styles.childHeader}>
        <View>
          <Text style={styles.childAvatar}>{item.avatar}</Text>
        </View>
        <View style={styles.childInfo}>
          <Text style={styles.childName}>{item.name}</Text>
          <Text style={styles.childStats}>
            {item.activities_completed} activities • {item.hours_learned}h learning
          </Text>
        </View>
        <Text style={styles.progressPercent}>{item.progress}%</Text>
      </View>

      <View style={styles.progressBarContainer}>
        <View
          style={[
            styles.progressBar,
            { width: `${item.progress}%` },
          ]}
        />
      </View>
    </TouchableOpacity>
  );

  const renderActivity = ({ item }: { item: Activity }) => (
    <View style={styles.activityItem}>
      <View style={styles.activityLeft}>
        <Text style={styles.activityChildName}>{item.child_name}</Text>
        <Text style={styles.activityName}>{item.activity_name}</Text>
        <Text style={styles.activityTime}>{item.completed_at}</Text>
      </View>
      <View style={styles.activityScore}>
        <Text style={styles.scoreValue}>{item.score}%</Text>
      </View>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Welcome Header */}
      <View style={styles.header}>
        <Text style={styles.welcomeText}>Welcome Back!</Text>
        <Text style={styles.headerSubtext}>
          Track your children's progress
        </Text>
      </View>

      {/* Quick Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>2</Text>
          <Text style={styles.statLabel}>Children</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>22</Text>
          <Text style={styles.statLabel}>Activities</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>14.7h</Text>
          <Text style={styles.statLabel}>Learning</Text>
        </View>
      </View>

      {/* Children Cards */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your Children</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Children')}>
            <Text style={styles.sectionLink}>View All →</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={children}
          renderItem={renderChildCard}
          keyExtractor={item => item.id}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      </View>

      {/* Recent Activities */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Activities</Text>
          <TouchableOpacity>
            <Text style={styles.sectionLink}>View All →</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={recentActivities}
          renderItem={renderActivity}
          keyExtractor={item => item.id}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={styles.divider} />}
        />
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Notifications')}
        >
          <Text style={styles.actionIcon}>🔔</Text>
          <Text style={styles.actionLabel}>Notifications</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Children')}
        >
          <Text style={styles.actionIcon}>➕</Text>
          <Text style={styles.actionLabel}>Link Child</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Settings')}
        >
          <Text style={styles.actionIcon}>⚙️</Text>
          <Text style={styles.actionLabel}>Settings</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerSubtext: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 24,
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  sectionLink: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '500',
  },
  childCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  childHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  childAvatar: {
    fontSize: 32,
    marginRight: 12,
  },
  childInfo: {
    flex: 1,
  },
  childName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  childStats: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  progressPercent: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#2563eb',
  },
  activityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  activityLeft: {
    flex: 1,
  },
  activityChildName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  activityName: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  activityTime: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  activityScore: {
    alignItems: 'center',
    paddingLeft: 12,
  },
  scoreValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#059669',
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
});
