import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';

const ResultsScreen = ({ route, navigation }) => {
  const [expandedStore, setExpandedStore] = useState(null);
  const { comparison, items, location } = route.params;

  /**
   * Calculate savings percentage
   */
  const calculateSavings = () => {
    const cheapest = comparison.cheapest_store.total_price;
    const mostExpensive = comparison.most_expensive_store.total_price;
    return cheapest > 0 ? ((mostExpensive - cheapest) / mostExpensive * 100).toFixed(1) : 0;
  };

  /**
   * Get chain logo emoji
   */
  const getChainEmoji = (chainName) => {
    const emojis = {
      'Shufersal': '🏪',
      'Rami Levy': '🛍️',
      'Victory': '⭐',
    };
    return emojis[chainName] || '🏬';
  };

  /**
   * Render store price card
   */
  const renderStoreCard = ({ item, index }) => {
    const isExpanded = expandedStore === item.id;
    const isCheapest = item.id === comparison.cheapest_store.id;
    const isMostExpensive = item.id === comparison.most_expensive_store.id;

    return (
      <TouchableOpacity
        style={[
          styles.storeCard,
          isCheapest && styles.storeCardCheapest,
          isMostExpensive && styles.storeCardExpensive,
        ]}
        onPress={() => setExpandedStore(isExpanded ? null : item.id)}
        activeOpacity={0.7}
      >
        {/* Store Header */}
        <View style={styles.storeHeader}>
          <View style={styles.storeInfo}>
            <View style={styles.chainBadge}>
              <Text style={styles.chainEmoji}>{getChainEmoji(item.chain_name)}</Text>
              <Text style={styles.storeName}>{item.name}</Text>
            </View>
            <View style={styles.storeMetrics}>
              <View style={styles.metricItem}>
                <MaterialIcons name="location-on" size={14} color="#666" />
                <Text style={styles.metricText}>{item.distance_km.toFixed(2)} km</Text>
              </View>
              <View style={styles.metricItem}>
                <MaterialIcons name="check-circle" size={14} color="#4CAF50" />
                <Text style={styles.metricText}>{item.items_found}/{items.length}</Text>
              </View>
            </View>
          </View>

          <View style={styles.priceSection}>
            <Text style={styles.priceLabel}>Total</Text>
            <Text style={[styles.price, isCheapest && styles.priceCheapest]}>
              ₪{item.total_price.toFixed(2)}
            </Text>
            {isCheapest && <View style={styles.bestBadge} />}
          </View>

          <MaterialIcons
            name={isExpanded ? 'expand-less' : 'expand-more'}
            size={24}
            color="#666"
          />
        </View>

        {/* Expanded Details */}
        {isExpanded && (
          <View style={styles.expandedContent}>
            <View style={styles.separator} />

            {/* Item Details */}
            <Text style={styles.detailsTitle}>Item Prices</Text>
            <View style={styles.itemsList}>
              {item.items.map((product, idx) => (
                <View key={idx} style={styles.itemDetail}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{product.product_name}</Text>
                    <Text style={styles.itemUnit}>{product.unit}</Text>
                  </View>
                  <Text style={styles.itemPrice}>₪{product.price.toFixed(2)}</Text>
                </View>
              ))}
            </View>

            {/* Missing Items */}
            {item.items_found < items.length && (
              <View style={styles.missingItems}>
                <MaterialIcons name="info" size={16} color="#FF9800" />
                <Text style={styles.missingText}>
                  {items.length - item.items_found} item(s) not available
                </Text>
              </View>
            )}

            {/* Action Button */}
            <TouchableOpacity style={styles.actionButton}>
              <MaterialCommunityIcons name="phone" size={18} color="#2196F3" />
              <Text style={styles.actionButtonText}>Call Store</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={styles.title}>Price Comparison Results</Text>
          <Text style={styles.subtitle}>
            {comparison.stores_compared} stores • {comparison.items_searched} items
          </Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summarySection}>
            <Text style={styles.summaryLabel}>Cheapest</Text>
            <Text style={styles.summaryStore}>
              {comparison.cheapest_store.name}
            </Text>
            <Text style={styles.summaryPrice}>
              ₪{comparison.cheapest_store.total_price.toFixed(2)}
            </Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summarySection}>
            <Text style={styles.summaryLabel}>Potential Savings</Text>
            <Text style={styles.savingsAmount}>
              ₪{comparison.potential_savings_nis.toFixed(2)}
            </Text>
            <Text style={styles.savingsPercent}>
              {comparison.savings_percentage.toFixed(1)}% discount
            </Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summarySection}>
            <Text style={styles.summaryLabel}>Most Expensive</Text>
            <Text style={styles.summaryStore}>
              {comparison.most_expensive_store.name}
            </Text>
            <Text style={styles.summaryPrice}>
              ₪{comparison.most_expensive_store.total_price.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Store Ranking */}
        <View style={styles.rankingSection}>
          <Text style={styles.rankingTitle}>Store Ranking</Text>

          <FlatList
            data={comparison.all_comparisons}
            renderItem={renderStoreCard}
            keyExtractor={(item) => item.id.toString()}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.cardSeparator} />}
          />
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <MaterialIcons name="info" size={20} color="#2196F3" />
          <Text style={styles.infoText}>
            Prices are updated regularly. Availability varies by store and time.
          </Text>
        </View>
      </ScrollView>

      {/* Action Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="refresh" size={20} color="#FFF" />
          <Text style={styles.refreshButtonText}>New Search</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  subtitle: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  content: {
    flex: 1,
    padding: 12,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-around',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  summarySection: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryStore: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  summaryPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2196F3',
  },
  savingsAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4CAF50',
  },
  savingsPercent: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 8,
  },
  rankingSection: {
    marginBottom: 16,
  },
  rankingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  storeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  storeCardCheapest: {
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  storeCardExpensive: {
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B6B',
  },
  storeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FAFAFA',
  },
  storeInfo: {
    flex: 1,
  },
  chainBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  chainEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  storeName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  storeMetrics: {
    flexDirection: 'row',
    marginTop: 4,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  metricText: {
    fontSize: 11,
    color: '#666',
    marginLeft: 4,
  },
  priceSection: {
    alignItems: 'flex-end',
    marginRight: 10,
  },
  priceLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 2,
  },
  price: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  priceCheapest: {
    color: '#4CAF50',
  },
  bestBadge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    marginTop: 4,
  },
  expandedContent: {
    padding: 12,
    backgroundColor: '#FFFFFF',
  },
  separator: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginBottom: 12,
  },
  detailsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  itemsList: {
    marginBottom: 12,
  },
  itemDetail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
  },
  itemUnit: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2196F3',
  },
  missingItems: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    padding: 10,
    borderRadius: 6,
    marginBottom: 12,
  },
  missingText: {
    fontSize: 12,
    color: '#E65100',
    marginLeft: 8,
    fontWeight: '500',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    marginTop: 8,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2196F3',
    marginLeft: 6,
  },
  cardSeparator: {
    height: 8,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#1565C0',
    marginLeft: 10,
    fontWeight: '500',
  },
  footer: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  refreshButton: {
    backgroundColor: '#2196F3',
    borderRadius: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  refreshButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
    marginLeft: 8,
  },
});

export default ResultsScreen;
