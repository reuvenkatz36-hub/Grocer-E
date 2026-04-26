import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  StatusBar,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Keyboard,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import api from '../services/api';

const HomeScreen = ({ navigation }) => {
  // State management
  const [products, setProducts] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [location, setLocation] = useState(null);
  const [radius, setRadius] = useState(5);
  const [loading, setLoading] = useState(false);
  const [locationPermissionDenied, setLocationPermissionDenied] = useState(false);

  // Request location permission on mount
  useEffect(() => {
    requestLocationPermission();
  }, []);

  /**
   * Request device location permission
   */
  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationPermissionDenied(true);
        Alert.alert(
          'Location Permission',
          'Location access is required to find nearby stores.',
          [{ text: 'OK' }]
        );
        return;
      }
      getCurrentLocation();
    } catch (error) {
      console.error('Error requesting location permission:', error);
      Alert.alert('Error', 'Failed to request location permission');
    }
  };

  /**
   * Get current user location
   */
  const getCurrentLocation = async () => {
    try {
      setLoading(true);
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      });
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('Error', 'Failed to get your location');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Add product to shopping list
   */
  const addProduct = () => {
    if (!inputValue.trim()) {
      Alert.alert('Empty Product', 'Please enter a product name');
      return;
    }

    const quantityNum = parseFloat(quantity) || 1;
    if (quantityNum <= 0) {
      Alert.alert('Invalid Quantity', 'Quantity must be greater than 0');
      return;
    }

    const newProduct = {
      id: Date.now(),
      name: inputValue.trim(),
      quantity: quantityNum,
      product_id: inputValue.trim().toLowerCase().replace(/\s+/g, '_'),
    };

    setProducts([...products, newProduct]);
    setInputValue('');
    setQuantity('1');
    Keyboard.dismiss();
  };

  /**
   * Remove product from shopping list
   */
  const removeProduct = (id) => {
    setProducts(products.filter(p => p.id !== id));
  };

  /**
   * Clear entire shopping list
   */
  const clearList = () => {
    Alert.alert(
      'Clear List',
      'Are you sure you want to clear all products?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => setProducts([]),
        },
      ]
    );
  };

  /**
   * Compare prices and navigate to results
   */
  const comparePrice = async () => {
    if (products.length === 0) {
      Alert.alert('Empty List', 'Please add at least one product');
      return;
    }

    if (!location) {
      Alert.alert('No Location', 'Please enable location to continue');
      await requestLocationPermission();
      return;
    }

    try {
      setLoading(true);

      const response = await api.compareBasketPrices({
        items: products,
        latitude: location.latitude,
        longitude: location.longitude,
        radius,
      });

      if (response.success) {
        navigation.navigate('Results', {
          comparison: response.data,
          items: products,
          location,
        });
      } else {
        Alert.alert('Error', response.error || 'Failed to compare prices');
      }
    } catch (error) {
      console.error('Error comparing prices:', error);
      Alert.alert('Error', 'Failed to compare prices. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Render shopping list item
   */
  const renderProduct = ({ item }) => (
    <View style={styles.productItem}>
      <View style={styles.productInfo}>
        <Text style={styles.productName}>{item.name}</Text>
        <View style={styles.quantityBadge}>
          <Text style={styles.quantityText}>Qty: {item.quantity}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => removeProduct(item.id)}
      >
        <MaterialIcons name="close" size={20} color="#FF6B6B" />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Grocer-E</Text>
          <Text style={styles.subtitle}>Find Best Supermarket Deals</Text>
        </View>
        <MaterialCommunityIcons name="shopping-outline" size={28} color="#2196F3" />
      </View>

      {/* Location Status */}
      {!locationPermissionDenied && location && (
        <View style={styles.locationBanner}>
          <MaterialIcons name="location-on" size={16} color="#4CAF50" />
          <Text style={styles.locationText}>Location detected</Text>
          <TouchableOpacity onPress={getCurrentLocation}>
            <Text style={styles.refreshLocation}>Refresh</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Location Permission Denied */}
      {locationPermissionDenied && (
        <View style={styles.warningBanner}>
          <MaterialIcons name="warning" size={16} color="#FF6B6B" />
          <Text style={styles.warningText}>Location access required</Text>
          <TouchableOpacity onPress={requestLocationPermission}>
            <Text style={styles.enableLocation}>Enable</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Main Content */}
      <View style={styles.content}>
        {/* Product Input Section */}
        <View style={styles.inputSection}>
          <Text style={styles.sectionTitle}>Add Products</Text>

          <View style={styles.inputContainer}>
            <MaterialIcons name="local-grocery-store" size={20} color="#2196F3" />
            <TextInput
              style={styles.productInput}
              placeholder="Product name (e.g., Milk, Bread)"
              value={inputValue}
              onChangeText={setInputValue}
              placeholderTextColor="#CCC"
              onSubmitEditing={addProduct}
            />
          </View>

          <View style={styles.quantityRow}>
            <View style={styles.quantityContainer}>
              <Text style={styles.quantityLabel}>Quantity</Text>
              <TextInput
                style={styles.quantityInput}
                placeholder="1"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
                placeholderTextColor="#CCC"
              />
            </View>
            <TouchableOpacity
              style={styles.addButton}
              onPress={addProduct}
              disabled={loading}
            >
              <MaterialIcons name="add-circle" size={24} color="#FFF" />
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Radius Selector */}
        <View style={styles.radiusSection}>
          <Text style={styles.sectionTitle}>Search Radius</Text>
          <View style={styles.radiusOptions}>
            {[3, 5, 10, 20].map((r) => (
              <TouchableOpacity
                key={r}
                style={[
                  styles.radiusButton,
                  radius === r && styles.radiusButtonActive,
                ]}
                onPress={() => setRadius(r)}
              >
                <Text
                  style={[
                    styles.radiusButtonText,
                    radius === r && styles.radiusButtonTextActive,
                  ]}
                >
                  {r} km
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Shopping List */}
        <View style={styles.listSection}>
          <View style={styles.listHeader}>
            <Text style={styles.sectionTitle}>
              Shopping List ({products.length})
            </Text>
            {products.length > 0 && (
              <TouchableOpacity onPress={clearList}>
                <Text style={styles.clearLink}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          {products.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="basket-outline"
                size={48}
                color="#DDD"
              />
              <Text style={styles.emptyText}>No products added yet</Text>
              <Text style={styles.emptySubtext}>
                Add products to start comparing prices
              </Text>
            </View>
          ) : (
            <FlatList
              data={products}
              renderItem={renderProduct}
              keyExtractor={(item) => item.id.toString()}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          )}
        </View>
      </View>

      {/* Compare Button */}
      {products.length > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.compareButton}
            onPress={comparePrice}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <MaterialIcons name="compare-arrows" size={20} color="#FFF" />
                <Text style={styles.compareButtonText}>Compare Prices</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
  },
  subtitle: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  locationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 10,
    margin: 10,
    borderRadius: 8,
  },
  locationText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#2E7D32',
    marginLeft: 8,
  },
  refreshLocation: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2E7D32',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 12,
    paddingVertical: 10,
    margin: 10,
    borderRadius: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#C62828',
    marginLeft: 8,
  },
  enableLocation: {
    fontSize: 11,
    fontWeight: '600',
    color: '#C62828',
  },
  content: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  inputSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
    marginBottom: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  productInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    fontSize: 14,
    color: '#333',
  },
  quantityRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quantityContainer: {
    flex: 1,
  },
  quantityLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  quantityInput: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
  },
  addButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
  },
  addButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  radiusSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  radiusOptions: {
    flexDirection: 'row',
    gap: 10,
  },
  radiusButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  radiusButtonActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  radiusButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  radiusButtonTextActive: {
    color: '#FFF',
  },
  listSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    flex: 1,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  clearLink: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#CCC',
    marginTop: 4,
  },
  productItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  productInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  productName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    flex: 1,
  },
  quantityBadge: {
    backgroundColor: '#E3F2FD',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  quantityText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1976D2',
  },
  deleteButton: {
    padding: 8,
  },
  separator: {
    height: 1,
    backgroundColor: '#F0F0F0',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  compareButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 6,
  },
  compareButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
  },
});

export default HomeScreen;
